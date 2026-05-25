from celery.utils.log import get_task_logger

from queuely.tasks.celery_app import celery_app


logger = get_task_logger(__name__)


@celery_app.task(bind=True, name="queuely.tasks.jobs.process_pdf")
def process_pdf(self, job_id: str) -> dict[str, str]:
    logger.info("Placeholder PDF task for job %s", job_id)
    return {"job_id": job_id, "status": "placeholder"}


@celery_app.task(bind=True, name="queuely.tasks.jobs.generate_report")
def generate_report(self, job_id: str) -> dict[str, str]:
    logger.info("Placeholder report task for job %s", job_id)
    return {"job_id": job_id, "status": "placeholder"}


@celery_app.task(bind=True, name="queuely.tasks.jobs.send_email")
def send_email(self, job_id: str) -> dict[str, str]:
    logger.info("Placeholder email task for job %s", job_id)
    return {"job_id": job_id, "status": "placeholder"}
