from datetime import datetime

from pydantic import BaseModel, Field

from queuely.schemas.jobs import JobRead


class QueueDepth(BaseModel):
    name: str
    depth: int


class QueuesRead(BaseModel):
    queues: list[QueueDepth]


class WorkerRead(BaseModel):
    worker_name: str
    queue_name: str
    hostname: str
    process_id: int
    last_seen_at: datetime
    active_jobs: int
    healthy: bool


class WorkersRead(BaseModel):
    workers: list[WorkerRead]


class DeadLetterJobsRead(BaseModel):
    items: list[JobRead]
    total: int
    limit: int
    offset: int


class RequeueResponse(BaseModel):
    job_id: str
    requeued: bool
    new_status: str
    celery_task_id: str | None
