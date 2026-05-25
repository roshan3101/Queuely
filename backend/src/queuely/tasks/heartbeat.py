from __future__ import annotations

import os
import socket
from datetime import UTC, datetime

from celery import signals
from sqlalchemy import select

from queuely.db.session import SessionLocal
from queuely.models.worker import WorkerHeartbeat


def _worker_identity() -> tuple[str, str, int]:
    hostname = socket.gethostname()
    pid = os.getpid()
    # Celery worker process names include concurrency suffixes; keep a stable identifier we can query.
    worker_name = f"{hostname}:{pid}"
    return worker_name, hostname, pid


def _touch_heartbeat(queue_name: str) -> None:
    worker_name, hostname, pid = _worker_identity()
    now = datetime.now(UTC)

    with SessionLocal() as session:
        hb = session.scalar(select(WorkerHeartbeat).where(WorkerHeartbeat.worker_name == worker_name))
        if hb is None:
            hb = WorkerHeartbeat(
                worker_name=worker_name,
                queue_name=queue_name,
                hostname=hostname,
                process_id=pid,
                last_seen_at=now,
                active_jobs=0,
                meta={},
            )
            session.add(hb)
        else:
            hb.queue_name = queue_name
            hb.last_seen_at = now
        session.commit()


@signals.worker_ready.connect
def on_worker_ready(sender=None, **kwargs) -> None:
    _touch_heartbeat(queue_name="jobs.default")


@signals.task_prerun.connect
def on_task_prerun(sender=None, task_id=None, task=None, args=None, kwargs=None, **extras) -> None:
    _touch_heartbeat(queue_name=getattr(task, "queue", "jobs.default"))

