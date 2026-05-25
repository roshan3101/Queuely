from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, status
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from queuely.api.auth import require_superuser
from queuely.api.dependencies import get_db_session, get_redis, get_request_id
from queuely.core.responses import ApiResponse
from queuely.db.job_store import add_event
from queuely.models.job import Job, JobStatus
from queuely.models.worker import WorkerHeartbeat
from queuely.schemas.ops import DeadLetterJobsRead, QueuesRead, QueueDepth, RequeueResponse, WorkerRead, WorkersRead
from queuely.services.jobs import JOB_QUEUE_MAP, JOB_TASK_MAP, serialize_job
from queuely.tasks.celery_app import celery_app


router = APIRouter(prefix="/ops", tags=["ops"])


@router.get("/queues", response_model=ApiResponse[QueuesRead])
async def queues(
    redis_client: Redis = Depends(get_redis),
    _: object = Depends(require_superuser),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[QueuesRead]:
    queue_names = sorted(set(JOB_QUEUE_MAP.values()) | {"jobs.dlq"})
    depths: list[QueueDepth] = []
    for name in queue_names:
        depth = int(await redis_client.llen(name))
        depths.append(QueueDepth(name=name, depth=depth))
    return ApiResponse(data=QueuesRead(queues=depths), request_id=request_id)


@router.get("/workers", response_model=ApiResponse[WorkersRead])
def workers(
    session: Session = Depends(get_db_session),
    _: object = Depends(require_superuser),
    request_id: str | None = Depends(get_request_id),
    healthy_within_seconds: int = Query(default=60, ge=5, le=3600),
) -> ApiResponse[WorkersRead]:
    cutoff = datetime.now(UTC) - timedelta(seconds=healthy_within_seconds)
    stmt = select(WorkerHeartbeat).order_by(WorkerHeartbeat.last_seen_at.desc()).limit(200)
    rows = list(session.scalars(stmt))
    data = WorkersRead(
        workers=[
            WorkerRead(
                worker_name=row.worker_name,
                queue_name=row.queue_name,
                hostname=row.hostname,
                process_id=row.process_id,
                last_seen_at=row.last_seen_at,
                active_jobs=row.active_jobs,
                healthy=row.last_seen_at >= cutoff,
            )
            for row in rows
        ]
    )
    return ApiResponse(data=data, request_id=request_id)


@router.get("/jobs/dead-lettered", response_model=ApiResponse[DeadLetterJobsRead])
def dead_lettered_jobs(
    session: Session = Depends(get_db_session),
    _: object = Depends(require_superuser),
    request_id: str | None = Depends(get_request_id),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[DeadLetterJobsRead]:
    total = session.scalar(select(func.count()).select_from(Job).where(Job.status == JobStatus.dead_lettered)) or 0
    stmt = (
        select(Job)
        .where(Job.status == JobStatus.dead_lettered)
        .order_by(Job.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    jobs = [serialize_job(job, include_events=False) for job in session.scalars(stmt)]
    return ApiResponse(data=DeadLetterJobsRead(items=jobs, total=total, limit=limit, offset=offset), request_id=request_id)


@router.post("/jobs/{job_id}/requeue", response_model=ApiResponse[RequeueResponse], status_code=status.HTTP_202_ACCEPTED)
def requeue_dead_lettered_job(
    job_id: str,
    session: Session = Depends(get_db_session),
    _: object = Depends(require_superuser),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[RequeueResponse]:
    job = session.get(Job, job_id)
    if not job:
        return ApiResponse(data=RequeueResponse(job_id=job_id, requeued=False, new_status="not_found", celery_task_id=None), request_id=request_id)
    if job.status != JobStatus.dead_lettered:
        return ApiResponse(
            data=RequeueResponse(job_id=job_id, requeued=False, new_status=job.status.value, celery_task_id=job.celery_task_id),
            request_id=request_id,
        )

    job.status = JobStatus.pending
    job.retry_count = 0
    job.error_message = None
    job.completed_at = None
    job.started_at = None
    job.celery_task_id = None
    if isinstance(job.payload, dict) and job.payload.get("raise") is True:
        job.payload = {**job.payload, "raise": False}

    add_event(
        session,
        job_id=job.id,
        event_type="job_requeued",
        status=JobStatus.pending,
        message="Operator requeued dead-lettered job.",
        metadata={},
    )
    session.commit()

    queue_name = job.queue_name
    task_name = JOB_TASK_MAP[job.job_type]
    celery_task_id = celery_app.send_task(task_name, args=[job.id], queue=queue_name).id
    job.celery_task_id = celery_task_id
    job.status = JobStatus.queued
    add_event(
        session,
        job_id=job.id,
        event_type="job_queued",
        status=JobStatus.queued,
        message="Operator re-dispatched job to Celery.",
        metadata={"task_name": task_name, "celery_task_id": celery_task_id},
    )
    session.commit()

    return ApiResponse(
        data=RequeueResponse(job_id=job.id, requeued=True, new_status=job.status.value, celery_task_id=celery_task_id),
        request_id=request_id,
    )
