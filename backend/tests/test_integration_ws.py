from __future__ import annotations

import json
import os
import time

import httpx
import pytest
import websockets


def _base_url() -> str:
    return os.environ.get("QUEUELY_TEST_API_BASE_URL", "http://localhost:8000")


def _ws_url() -> str:
    base = _base_url()
    if base.startswith("https://"):
        return "wss://" + base.removeprefix("https://") + "/ws"
    return "ws://" + base.removeprefix("http://") + "/ws"


def _register_and_login() -> str:
    email = f"ws_{int(time.time())}@example.com"
    password = "Password123!"
    httpx.post(f"{_base_url()}/auth/register", json={"email": email, "password": password, "full_name": "WS"}, timeout=30.0)
    login = httpx.post(f"{_base_url()}/auth/login", json={"email": email, "password": password}, timeout=30.0)
    login.raise_for_status()
    return login.json()["data"]["tokens"]["access_token"]


async def test_ws_receives_job_event() -> None:
    if os.environ.get("QUEUELY_TEST_DISABLE_OPENAI") != "1":
        pytest.skip("WS integration test is intended for docker harness runs.")
    token = _register_and_login()
    ws = _ws_url() + f"?token={token}"

    async with websockets.connect(ws, open_timeout=10) as websocket:
        # Submit a job for this user to trigger job events.
        resp = httpx.post(
            f"{_base_url()}/jobs",
            json={"job_type": "custom", "payload": {}, "priority": 5, "max_retries": 0, "scheduled_at": None},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
        resp.raise_for_status()
        job_id = resp.json()["data"]["id"]

        # We expect at least one job_event for this job to arrive.
        for _ in range(20):
            raw = await websocket.recv()
            message = json.loads(raw)
            if message.get("type") == "job_event" and message.get("job_id") == job_id:
                return

        raise AssertionError("Expected a job_event for submitted job_id, but none arrived.")
