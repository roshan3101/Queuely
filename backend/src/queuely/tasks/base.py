from __future__ import annotations

import math
from typing import Any

from celery import Task
from celery.exceptions import Ignore

from queuely.db.job_store import (
    get_job,
    mark_dead_lettered,
    mark_retrying,
    mark_running,
    mark_succeeded,
)
from queuely.db.session import SessionLocal
from queuely.models.job import JobStatus


def exponential_backoff_seconds(retry_index: int, *, base_seconds: int = 2, max_seconds: int = 300) -> int:
    seconds = base_seconds * (2 ** max(0, retry_index))
    return int(min(max_seconds, seconds))


class BaseJobTask(Task):
    abstract = True

    def _job_id_from_args(self, args: tuple[Any, ...], kwargs: dict[str, Any]) -> str | None:
        if args:
            return str(args[0])
        return str(kwargs.get("job_id")) if "job_id" in kwargs else None

    def __call__(self, *args: Any, **kwargs: Any):
        job_id = self._job_id_from_args(args, kwargs)
        if job_id:
            with SessionLocal() as session:
                job = get_job(session, job_id)
                if job and job.status not in {JobStatus.cancelled, JobStatus.dead_lettered}:
                    mark_running(session, job, task_id=str(self.request.id))
                    session.commit()
        return super().__call__(*args, **kwargs)

    def on_success(self, retval: Any, task_id: str, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        job_id = self._job_id_from_args(args, kwargs)
        if not job_id:
            return
        with SessionLocal() as session:
            job = get_job(session, job_id)
            if not job:
                return
            if job.status == JobStatus.cancelled:
                return
            result = retval if isinstance(retval, dict) else {"result": retval}
            mark_succeeded(session, job, result=result)
            session.commit()

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        einfo,
    ) -> None:
        # Failures are recorded either as retrying or dead_lettered by handle_failure().
        return

    def handle_failure(self, exc: Exception, *, job_id: str) -> None:
        with SessionLocal() as session:
            job = get_job(session, job_id)
            if not job:
                raise exc
            if job.status == JobStatus.cancelled:
                raise Ignore()

            if job.retry_count < job.max_retries:
                retry_index = max(0, job.retry_count)
                countdown = exponential_backoff_seconds(retry_index)
                mark_retrying(session, job, exc_message=str(exc), countdown=countdown)
                session.commit()
                raise self.retry(exc=exc, countdown=countdown)

            mark_dead_lettered(session, job, error_message=str(exc))
            session.commit()
            raise Ignore()


class DeadLetterTask(Task):
    abstract = True

    def dead_letter(self, job_id: str, error_message: str) -> None:
        with SessionLocal() as session:
            job = get_job(session, job_id)
            if not job:
                return
            if job.status == JobStatus.cancelled:
                return
            mark_dead_lettered(session, job, error_message=error_message)
            session.commit()
