from __future__ import annotations

import os
import time

import httpx
import pytest


def _base_url() -> str:
    return os.environ.get("QUEUELY_TEST_API_BASE_URL", "http://localhost:8000")


def _register_and_login() -> str:
    email = f"worker_{int(time.time())}@example.com"
    password = "Password123!"
    httpx.post(f"{_base_url()}/auth/register", json={"email": email, "password": password, "full_name": "Worker"}, timeout=30.0)
    login = httpx.post(f"{_base_url()}/auth/login", json={"email": email, "password": password}, timeout=30.0)
    login.raise_for_status()
    return login.json()["data"]["tokens"]["access_token"]


def _submit_custom_job(token: str, payload: dict, max_retries: int) -> str:
    resp = httpx.post(
        f"{_base_url()}/jobs",
        json={"job_type": "custom", "payload": payload, "priority": 5, "max_retries": max_retries, "scheduled_at": None},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["data"]["id"]


def _wait_for_status(token: str, job_id: str, expected: str, timeout_s: float = 30.0) -> dict:
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        resp = httpx.get(f"{_base_url()}/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"}, timeout=10.0)
        resp.raise_for_status()
        last = resp.json()["data"]
        if last["status"] == expected:
            return last
        time.sleep(0.5)
    raise AssertionError(f"Job {job_id} never reached status={expected}, last={last}")


def test_worker_dead_letters_on_first_failure_when_no_retries() -> None:
    if os.environ.get("QUEUELY_TEST_DISABLE_OPENAI") != "1":
        pytest.skip("Worker integration test is intended for docker harness runs.")

    token = _register_and_login()
    job_id = _submit_custom_job(token, payload={"raise": True}, max_retries=0)
    job = _wait_for_status(token, job_id, expected="dead_lettered", timeout_s=45.0)
    assert job["retry_count"] == 0
    assert job["error_message"]


def test_worker_retries_then_dead_letters_when_exhausted() -> None:
    if os.environ.get("QUEUELY_TEST_DISABLE_OPENAI") != "1":
        pytest.skip("Worker integration test is intended for docker harness runs.")

    token = _register_and_login()
    job_id = _submit_custom_job(token, payload={"raise": True}, max_retries=1)
    job = _wait_for_status(token, job_id, expected="dead_lettered", timeout_s=60.0)
    assert job["retry_count"] >= 1
    assert job["error_message"]

