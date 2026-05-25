from __future__ import annotations

from dataclasses import dataclass

import pytest

import queuely.tasks.base as base
from queuely.models.job import JobStatus


@dataclass
class DummyJob:
    id: str
    status: JobStatus
    retry_count: int
    max_retries: int


class DummySession:
    def commit(self) -> None:  # pragma: no cover
        return


class DummySessionLocal:
    def __enter__(self) -> DummySession:
        return DummySession()

    def __exit__(self, exc_type, exc, tb) -> None:  # pragma: no cover
        return


class DummyTask(base.BaseJobTask):
    def retry(self, exc: Exception, countdown: int):  # type: ignore[override]
        raise RuntimeError(f"retry(countdown={countdown})")


def test_handle_failure_marks_retrying_then_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    job = DummyJob(id="job-1", status=JobStatus.running, retry_count=0, max_retries=2)
    calls: dict[str, object] = {}

    monkeypatch.setattr(base, "SessionLocal", DummySessionLocal)
    monkeypatch.setattr(base, "get_job", lambda _session, _job_id: job)

    def _mark_retrying(_session, _job, *, exc_message: str, countdown: int) -> None:
        calls["retrying"] = {"exc_message": exc_message, "countdown": countdown}
        _job.retry_count += 1
        _job.status = JobStatus.retrying

    monkeypatch.setattr(base, "mark_retrying", _mark_retrying)
    monkeypatch.setattr(base, "mark_dead_lettered", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected dlq")))

    task = DummyTask()
    with pytest.raises(RuntimeError) as excinfo:
        task.handle_failure(RuntimeError("boom"), job_id="job-1")

    assert "retry(" in str(excinfo.value)
    assert job.status == JobStatus.retrying
    assert job.retry_count == 1
    assert "retrying" in calls


def test_handle_failure_marks_dead_lettered_when_exhausted(monkeypatch: pytest.MonkeyPatch) -> None:
    job = DummyJob(id="job-2", status=JobStatus.running, retry_count=3, max_retries=3)
    calls: dict[str, object] = {}

    monkeypatch.setattr(base, "SessionLocal", DummySessionLocal)
    monkeypatch.setattr(base, "get_job", lambda _session, _job_id: job)

    monkeypatch.setattr(base, "mark_retrying", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected retrying")))

    def _mark_dead_lettered(_session, _job, *, error_message: str) -> None:
        calls["dlq"] = error_message
        _job.status = JobStatus.dead_lettered

    monkeypatch.setattr(base, "mark_dead_lettered", _mark_dead_lettered)

    task = DummyTask()
    with pytest.raises(base.Ignore):
        task.handle_failure(RuntimeError("final"), job_id="job-2")

    assert job.status == JobStatus.dead_lettered
    assert calls["dlq"] == "final"

