from __future__ import annotations

import os


def pytest_configure() -> None:
    os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://queuely:queuely@localhost:5432/queuely")
    os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6379/0")
    os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
    os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
    os.environ.setdefault("OPENAI_API_KEY", "test-key")
    os.environ.setdefault("REDIS_HOST", "localhost")
    os.environ.setdefault("REDIS_PORT", "6379")
    os.environ.setdefault("REDIS_DB", "0")
