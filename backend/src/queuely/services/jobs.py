from datetime import UTC, datetime

from celery import uuid
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from queuely.core.exceptions import QueuelyError
from queuely.models.job import Job, JobEvent, JobStatus, JobType
from queuely.models.user import User
from queuely.schemas.jobs import JobCancelResponse, JobEventRead, JobListResponse, JobRead, JobSubmitRequest
from queuely.tasks.celery_app import celery_app


JOB_QUEUE_MAP: dict[JobType, str] = {
    JobType.pdf_processing: "jobs.pdf",
    JobType.report_generation: "jobs.report",
    JobType.email_sending: "jobs.email",
    JobType.custom: "jobs.default",
}

JOB_TASK_MAP: dict[JobType, str] = {
    JobType.pdf_processing: "queuely.tasks.jobs.process_pdf",
    JobType.report_generation: "queuely.tasks.jobs.generate_report",
    JobType.email_sending: "queuely.tasks.jobs.send_email",
    JobType.custom: "queuely.tasks.jobs.process_custom",
}

CANCELLABLE_STATUSES = {JobStatus.pending, JobStatus.queued, JobStatus.retrying}


def serialize_job_event(event: JobEvent) -> JobEventRead:
    return JobEventRead(
        id=event.id,
        event_type=event.event_type,
        status=event.status,
        message=event.message,
        metadata=event.meta,
        created_at=event.created_at,
    )


def serialize_job(job: Job, include_events: bool = True) -> JobRead:
    return JobRead(
        id=job.id,
        user_id=job.user_id,
        job_type=job.job_type,
        status=job.status,
        queue_name=job.queue_name,
        celery_task_id=job.celery_task_id,
        idempotency_key=job.idempotency_key,
        payload=job.payload,
        result=job.result,
        error_message=job.error_message,
        priority=job.priority,
        max_retries=job.max_retries,
        retry_count=job.retry_count,
        scheduled_at=job.scheduled_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        last_heartbeat_at=job.last_heartbeat_at,
        created_at=job.created_at,
        updated_at=job.updated_at,
        events=[serialize_job_event(event) for event in job.events] if include_events else [],
    )


def _record_event(
    session: Session,
    job: Job,
    event_type: str,
    status: JobStatus | None,
    message: str | None,
    metadata: dict | None = None,
) -> None:
    session.add(
        JobEvent(
            job_id=job.id,
            event_type=event_type,
            status=status,
            message=message,
            meta=metadata or {},
            created_at=datetime.now(UTC),
        )
    )


def _get_existing_idempotent_job(session: Session, user_id: str, idempotency_key: str | None) -> Job | None:
    if not idempotency_key:
        return None
    stmt = (
        select(Job)
        .where(Job.user_id == user_id, Job.idempotency_key == idempotency_key)
        .options(selectinload(Job.events))
        .order_by(Job.created_at.desc())
    )
    return session.scalars(stmt).first()


def submit_job(
    session: Session,
    user: User,
    payload: JobSubmitRequest,
    idempotency_key: str | None,
) -> JobRead:
    existing_job = _get_existing_idempotent_job(session, user.id, idempotency_key)
    if existing_job:
        return serialize_job(existing_job)

    queue_name = JOB_QUEUE_MAP[payload.job_type]
    task_name = JOB_TASK_MAP[payload.job_type]
    celery_task_id = uuid()

    job = Job(
        user_id=user.id,
        job_type=payload.job_type,
        status=JobStatus.pending,
        queue_name=queue_name,
        celery_task_id=celery_task_id,
        idempotency_key=idempotency_key,
        payload=payload.payload,
        priority=payload.priority,
        max_retries=payload.max_retries,
        scheduled_at=payload.scheduled_at,
    )
    session.add(job)
    session.flush()
    _record_event(
        session,
        job,
        event_type="job_submitted",
        status=JobStatus.pending,
        message="Job persisted and ready for queue dispatch.",
        metadata={"job_type": payload.job_type.value, "queue_name": queue_name},
    )

    celery_app.send_task(
        task_name,
        args=[job.id],
        task_id=celery_task_id,
        queue=queue_name,
        countdown=0,
    )
    job.status = JobStatus.queued
    _record_event(
        session,
        job,
        event_type="job_queued",
        status=JobStatus.queued,
        message="Job dispatched to Celery.",
        metadata={"task_name": task_name, "celery_task_id": celery_task_id},
    )
    session.commit()

    stmt = select(Job).where(Job.id == job.id).options(selectinload(Job.events))
    persisted_job = session.scalar(stmt)
    if persisted_job is None:
        raise QueuelyError("job_not_found", "Job could not be reloaded after submission.", 500)
    return serialize_job(persisted_job)


def get_job_for_user(session: Session, user: User, job_id: str) -> Job:
    stmt = select(Job).where(Job.id == job_id, Job.user_id == user.id).options(selectinload(Job.events))
    job = session.scalar(stmt)
    if not job:
        raise QueuelyError("job_not_found", "Job not found.", 404)
    return job


def list_jobs_for_user(
    session: Session,
    user: User,
    limit: int,
    offset: int,
    status: JobStatus | None,
    job_type: JobType | None,
) -> JobListResponse:
    filters = [Job.user_id == user.id]
    if status:
        filters.append(Job.status == status)
    if job_type:
        filters.append(Job.job_type == job_type)

    total = session.scalar(select(func.count()).select_from(Job).where(*filters)) or 0
    stmt = (
        select(Job)
        .where(*filters)
        .options(selectinload(Job.events))
        .order_by(Job.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    jobs = list(session.scalars(stmt))
    return JobListResponse(
        items=[serialize_job(job, include_events=False) for job in jobs],
        total=total,
        limit=limit,
        offset=offset,
    )


def cancel_job(session: Session, user: User, job_id: str) -> JobCancelResponse:
    job = get_job_for_user(session, user, job_id)
    if job.status not in CANCELLABLE_STATUSES:
        raise QueuelyError(
            "job_not_cancellable",
            f"Jobs in status '{job.status.value}' cannot be cancelled.",
            409,
        )

    if job.celery_task_id:
        celery_app.control.revoke(job.celery_task_id, terminate=False)
    job.status = JobStatus.cancelled
    job.completed_at = datetime.now(UTC)
    _record_event(
        session,
        job,
        event_type="job_cancelled",
        status=JobStatus.cancelled,
        message="Job was cancelled by the user.",
        metadata={"celery_task_id": job.celery_task_id},
    )
    session.commit()
    return JobCancelResponse(job_id=job.id, status=job.status, cancelled=True)
