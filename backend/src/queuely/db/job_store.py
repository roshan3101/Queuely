from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from queuely.models.job import Job, JobEvent, JobStatus
from queuely.services.pubsub import publish_job_event


def get_job(session: Session, job_id: str) -> Job | None:
    stmt = select(Job).where(Job.id == job_id).options(selectinload(Job.events))
    return session.scalar(stmt)


def add_event(
    session: Session,
    *,
    job_id: str,
    event_type: str,
    status: JobStatus | None,
    message: str | None,
    metadata: dict | None = None,
) -> None:
    event = JobEvent(
        job_id=job_id,
        event_type=event_type,
        status=status,
        message=message,
        meta=metadata or {},
        created_at=datetime.now(UTC),
    )
    session.add(event)
    job = session.get(Job, job_id)
    if job is not None:
        publish_job_event(
            job_id=job_id,
            user_id=job.user_id,
            event_type=event_type,
            status=status.value if status else None,
            created_at=event.created_at,
            payload={"message": message, "metadata": metadata or {}},
        )


def set_status(
    session: Session,
    *,
    job: Job,
    status: JobStatus,
    event_type: str,
    message: str | None,
    metadata: dict | None = None,
) -> None:
    job.status = status
    add_event(
        session,
        job_id=job.id,
        event_type=event_type,
        status=status,
        message=message,
        metadata=metadata,
    )


def mark_running(session: Session, job: Job, *, task_id: str) -> None:
    job.started_at = datetime.now(UTC)
    set_status(
        session,
        job=job,
        status=JobStatus.running,
        event_type="job_running",
        message="Worker started executing the job.",
        metadata={"celery_task_id": task_id},
    )


def mark_succeeded(session: Session, job: Job, *, result: dict | None) -> None:
    job.completed_at = datetime.now(UTC)
    job.result = result
    set_status(
        session,
        job=job,
        status=JobStatus.succeeded,
        event_type="job_succeeded",
        message="Job completed successfully.",
        metadata={},
    )


def mark_retrying(session: Session, job: Job, *, exc_message: str, countdown: int) -> None:
    job.retry_count += 1
    # Keep the latest failure visible on the job row even while retrying.
    job.error_message = exc_message
    set_status(
        session,
        job=job,
        status=JobStatus.retrying,
        event_type="job_retrying",
        message="Job failed and will be retried.",
        metadata={"error": exc_message, "countdown_seconds": countdown, "retry_count": job.retry_count},
    )


def mark_failed(session: Session, job: Job, *, error_message: str) -> None:
    job.completed_at = datetime.now(UTC)
    job.error_message = error_message
    set_status(
        session,
        job=job,
        status=JobStatus.failed,
        event_type="job_failed",
        message="Job failed.",
        metadata={"error": error_message},
    )


def mark_dead_lettered(session: Session, job: Job, *, error_message: str) -> None:
    job.completed_at = datetime.now(UTC)
    job.error_message = error_message
    set_status(
        session,
        job=job,
        status=JobStatus.dead_lettered,
        event_type="job_dead_lettered",
        message="Job exhausted retries and was dead-lettered.",
        metadata={"error": error_message},
    )
