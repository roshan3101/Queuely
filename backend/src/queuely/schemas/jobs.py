from datetime import datetime

from pydantic import BaseModel, Field

from queuely.models.job import JobStatus, JobType


class JobSubmitRequest(BaseModel):
    job_type: JobType
    payload: dict = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)
    max_retries: int = Field(default=5, ge=0, le=20)
    scheduled_at: datetime | None = None


class JobEventRead(BaseModel):
    id: str
    event_type: str
    status: JobStatus | None
    message: str | None
    metadata: dict
    created_at: datetime


class JobRead(BaseModel):
    id: str
    user_id: str
    job_type: JobType
    status: JobStatus
    queue_name: str
    celery_task_id: str | None
    idempotency_key: str | None
    payload: dict
    result: dict | None
    error_message: str | None
    priority: int
    max_retries: int
    retry_count: int
    scheduled_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    last_heartbeat_at: datetime | None
    created_at: datetime
    updated_at: datetime
    events: list[JobEventRead] = Field(default_factory=list)


class JobListResponse(BaseModel):
    items: list[JobRead]
    total: int
    limit: int
    offset: int


class JobCancelResponse(BaseModel):
    job_id: str
    status: JobStatus
    cancelled: bool
