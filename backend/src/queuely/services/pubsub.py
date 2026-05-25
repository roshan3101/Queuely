from __future__ import annotations

import json
from datetime import datetime

from redis import Redis

from queuely.core.config import get_settings


settings = get_settings()


def _redis_sync() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def publish_job_event(
    *,
    job_id: str,
    user_id: str,
    event_type: str,
    status: str | None,
    created_at: datetime,
    payload: dict | None = None,
) -> None:
    message = {
        "type": "job_event",
        "job_id": job_id,
        "user_id": user_id,
        "event_type": event_type,
        "status": status,
        "created_at": created_at.isoformat(),
        "payload": payload or {},
    }
    channel = "jobs.events"
    redis_client = _redis_sync()
    try:
        redis_client.publish(channel, json.dumps(message))
    finally:
        redis_client.close()
