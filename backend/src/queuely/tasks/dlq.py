from celery.utils.log import get_task_logger

from queuely.tasks.base import DeadLetterTask
from queuely.tasks.celery_app import celery_app


logger = get_task_logger(__name__)


@celery_app.task(bind=True, base=DeadLetterTask, name="queuely.tasks.dlq.dead_letter")
def dead_letter(self: DeadLetterTask, job_id: str, error_message: str) -> None:
    logger.error("Dead-lettering job %s: %s", job_id, error_message)
    self.dead_letter(job_id, error_message)
