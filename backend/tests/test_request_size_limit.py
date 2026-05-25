from __future__ import annotations

import os

from fastapi.testclient import TestClient

from queuely.api.main import create_app
from queuely.core.config import get_settings


def test_request_size_limit_rejects_large_payload() -> None:
    os.environ["MAX_REQUEST_SIZE_BYTES"] = "10"
    get_settings.cache_clear()
    app = create_app()
    client = TestClient(app)

    # 11 bytes + JSON overhead in body, but we only rely on Content-Length being > 10.
    body = "x" * 20
    response = client.post("/health", content=body)
    assert response.status_code == 413
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"]["code"] == "request_too_large"

