from celery.utils.log import get_task_logger

from queuely.tasks.celery_app import celery_app
from queuely.tasks.base import BaseJobTask
from queuely.tasks.dlq import dead_letter as dead_letter_task
from queuely.db.session import SessionLocal
from queuely.db.job_store import get_job


logger = get_task_logger(__name__)


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.process_pdf")
def process_pdf(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        logger.info("Placeholder PDF task for job %s", job_id)
        return {"job_id": job_id, "status": "placeholder"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.generate_report")
def generate_report(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        logger.info("Placeholder report task for job %s", job_id)
        return {"job_id": job_id, "status": "placeholder"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.send_email")
def send_email(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        logger.info("Placeholder email task for job %s", job_id)
        return {"job_id": job_id, "status": "placeholder"}
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
        return {"job_id": job_id, "status": "placeholder"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise
