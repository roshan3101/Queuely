from __future__ import annotations

import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from queuely.db.job_store import add_event, get_job
from queuely.db.session import SessionLocal
from queuely.models.job import JobStatus


def artifact_dir(kind: str) -> Path:
    root = Path("backend") / "storage" / kind
    root.mkdir(parents=True, exist_ok=True)
    return root


def atomic_write_text(path: Path, content: str, *, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", delete=False, dir=path.parent, encoding=encoding, newline="") as handle:
        handle.write(content)
        tmp_path = Path(handle.name)
    tmp_path.replace(path)


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    atomic_write_text(path, json.dumps(payload, indent=2, sort_keys=True))


def load_job_payload(job_id: str) -> dict[str, Any]:
    with SessionLocal() as session:
        job = get_job(session, job_id)
        if not job or not isinstance(job.payload, dict):
            return {}
        return dict(job.payload)


def emit_progress(
    job_id: str,
    *,
    step: int,
    steps_total: int,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    with SessionLocal() as session:
        job = get_job(session, job_id)
        if job and job.status == JobStatus.running:
            event_metadata = {"progress": step / max(steps_total, 1), "step": step, "steps_total": steps_total}
            if metadata:
                event_metadata.update(metadata)
            add_event(
                session,
                job_id=job_id,
                event_type="job_progress",
                status=JobStatus.running,
                message=message,
                metadata=event_metadata,
            )
            session.commit()
