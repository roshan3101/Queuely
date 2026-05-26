from __future__ import annotations

import os

import httpx
import pytest


def _base_url() -> str:
    return os.environ.get("QUEUELY_TEST_API_BASE_URL", "http://localhost:8000")


def _post_json(path: str, payload: dict, token: str | None = None) -> httpx.Response:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.post(f"{_base_url()}{path}", json=payload, headers=headers, timeout=30.0)


def _get(path: str, token: str | None = None) -> httpx.Response:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.get(f"{_base_url()}{path}", headers=headers, timeout=30.0)


def test_health() -> None:
    resp = httpx.get(f"{_base_url()}/health", timeout=10.0)
    assert resp.status_code == 200
    assert resp.json().get("status") == "ok"


def test_auth_sessions_files_flow() -> None:
    email = "integration@example.com"
    password = "Password123!"

    register = _post_json("/auth/register", {"email": email, "password": password, "full_name": "Integration"})
    assert register.status_code in (201, 409)

    login = _post_json("/auth/login", {"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["data"]["tokens"]["access_token"]

    create_session = _post_json("/sessions", {"title": "Integration session"}, token=token)
    assert create_session.status_code == 201
    session_id = create_session.json()["data"]["id"]

    list_sessions = _get("/sessions", token=token)
    assert list_sessions.status_code == 200
    assert any(s["id"] == session_id for s in list_sessions.json()["data"]["items"])

    if os.environ.get("QUEUELY_TEST_DISABLE_OPENAI") == "1":
        stream = httpx.post(
            f"{_base_url()}/sessions/{session_id}/messages/stream",
            json={"content": "hello"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=60.0,
        )
        assert stream.status_code == 200
        assert "event: done" in stream.text
    else:
        pytest.skip("Streaming test requires QUEUELY_TEST_DISABLE_OPENAI=1 (docker test harness).")

    list_messages = _get(f"/sessions/{session_id}/messages?limit=50&offset=0", token=token)
    assert list_messages.status_code == 200
    assert len(list_messages.json()["data"]["items"]) >= 2

    files = {"file": ("hello.py", b"print('hello')\n", "text/plain")}
    upload = httpx.post(
        f"{_base_url()}/files",
        files=files,
        data={"session_id": session_id},
        headers={"Authorization": f"Bearer {token}"},
        timeout=60.0,
    )
    assert upload.status_code == 201

    file_list = _get("/files?limit=10&offset=0", token=token)
    assert file_list.status_code == 200
    assert file_list.json()["data"]["items"]


def test_tasks_aliases_jobs() -> None:
    email = "tasks@example.com"
    password = "Password123!"

    register = _post_json("/auth/register", {"email": email, "password": password, "full_name": "Tasks"})
    assert register.status_code in (201, 409)

    login = _post_json("/auth/login", {"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["data"]["tokens"]["access_token"]

    submit = _post_json(
        "/tasks",
        {
            "job_type": "custom",
            "payload": {"source": "integration-test", "mode": "direct-task"},
            "priority": 5,
            "max_retries": 3,
        },
        token=token,
    )
    assert submit.status_code == 202

    list_tasks = _get("/tasks?limit=10&offset=0", token=token)
    assert list_tasks.status_code == 200
    assert any(item["job_type"] == "custom" for item in list_tasks.json()["data"]["items"])
