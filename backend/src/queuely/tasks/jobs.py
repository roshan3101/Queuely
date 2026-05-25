import time

from celery.utils.log import get_task_logger

from queuely.tasks.celery_app import celery_app
from queuely.tasks.base import BaseJobTask
from queuely.tasks.dlq import dead_letter as dead_letter_task
from queuely.db.session import SessionLocal
from queuely.db.job_store import add_event, get_job
from queuely.models.job import JobStatus


logger = get_task_logger(__name__)


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.process_pdf")
def process_pdf(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        logger.info("Placeholder PDF task for job %s", job_id)
        # Simulate multi-step processing and emit progress events.
        for step in range(1, 4):
            time.sleep(0.5)
            with SessionLocal() as session:
                job = get_job(session, job_id)
                if job and job.status == JobStatus.running:
                    add_event(
                        session,
                        job_id=job_id,
                        event_type="job_progress",
                        status=JobStatus.running,
                        message="PDF processing progress update.",
                        metadata={"progress": step / 3.0, "step": step, "steps_total": 3},
                    )
                    session.commit()
        return {"job_id": job_id, "kind": "pdf_processing", "status": "ok"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.generate_report")
def generate_report(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        logger.info("Placeholder report task for job %s", job_id)
        time.sleep(0.75)
        return {"job_id": job_id, "kind": "report_generation", "status": "ok", "report_id": f"rpt_{job_id[:8]}"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.send_email")
def send_email(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        logger.info("Placeholder email task for job %s", job_id)
        with SessionLocal() as session:
            job = get_job(session, job_id)
            to_email = None
            if job and isinstance(job.payload, dict):
                to_email = job.payload.get("to")
            if not to_email:
                raise ValueError("Missing required payload field: to")
        time.sleep(0.4)
        return {"job_id": job_id, "kind": "email_sending", "status": "ok", "to": str(to_email)}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.process_custom")
def process_custom(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        with SessionLocal() as session:
            job = get_job(session, job_id)
            if job and isinstance(job.payload, dict) and job.payload.get("raise") is True:
                raise RuntimeError("Intentional failure for DLQ smoke test.")
        logger.info("Placeholder custom task for job %s", job_id)
        time.sleep(0.25)
        return {"job_id": job_id, "kind": "custom", "status": "ok"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise
