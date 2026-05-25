from __future__ import annotations

import os

import httpx


def _base_url() -> str:
    return os.environ.get("QUEUELY_TEST_API_BASE_URL", "http://localhost:8000")


def test_health() -> None:
    resp = httpx.get(f"{_base_url()}/health", timeout=10.0)
    assert resp.status_code == 200
    assert resp.json().get("status") == "ok"

