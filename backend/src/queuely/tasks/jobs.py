from __future__ import annotations

import time

from celery.utils.log import get_task_logger

from queuely.db.job_store import get_job
from queuely.db.session import SessionLocal
from queuely.job_processors import execute_email_job, execute_pdf_job, execute_report_job
from queuely.tasks.base import BaseJobTask
from queuely.tasks.celery_app import celery_app
from queuely.tasks.dlq import dead_letter as dead_letter_task
from queuely.job_processors.runtime import load_job_payload


logger = get_task_logger(__name__)


def _run_with_failure_handling(task: BaseJobTask, job_id: str, runner) -> dict[str, object]:
    try:
        payload = load_job_payload(job_id)
        return runner(job_id, payload)
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        task.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.process_pdf")
def process_pdf(self: BaseJobTask, job_id: str) -> dict[str, object]:
    return _run_with_failure_handling(self, job_id, execute_pdf_job)


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.generate_report")
def generate_report(self: BaseJobTask, job_id: str) -> dict[str, object]:
    return _run_with_failure_handling(self, job_id, execute_report_job)


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.send_email")
def send_email(self: BaseJobTask, job_id: str) -> dict[str, object]:
    return _run_with_failure_handling(self, job_id, execute_email_job)


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.process_custom")
def process_custom(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        with SessionLocal() as session:
            job = get_job(session, job_id)
            if job and isinstance(job.payload, dict) and job.payload.get("raise") is True:
                raise RuntimeError("Intentional failure for DLQ smoke test.")
        logger.info("Custom task for job %s", job_id)
        time.sleep(0.25)
        return {"job_id": job_id, "kind": "custom", "status": "ok"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise
