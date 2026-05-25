from celery import Celery

from queuely.core.config import get_settings


settings = get_settings()

celery_app = Celery(
    "queuely",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_default_queue="jobs.default",
    task_routes={
        "queuely.tasks.jobs.process_pdf": {"queue": "jobs.pdf"},
        "queuely.tasks.jobs.generate_report": {"queue": "jobs.report"},
        "queuely.tasks.jobs.send_email": {"queue": "jobs.email"},
    },
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)
