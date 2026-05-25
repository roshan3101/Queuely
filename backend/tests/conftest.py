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


def pytest_sessionstart() -> None:
    # For integration runs we may not want any network/OpenAI calls.
    if os.environ.get("QUEUELY_TEST_DISABLE_OPENAI") != "1":
        return

    try:
        import queuely.services.ai_chat as ai_chat
        import queuely.services.ai_embeddings as ai_embeddings
    except Exception:
        return

    def _complete(_messages):
        return "test-response"

    def _stream_complete(_messages):
        yield "test-response"

    def _embed_text(_text: str):
        return [0.0] * 1536

    ai_chat.complete = _complete  # type: ignore[assignment]
    ai_chat.stream_complete = _stream_complete  # type: ignore[assignment]
    ai_embeddings.embed_text = _embed_text  # type: ignore[assignment]
