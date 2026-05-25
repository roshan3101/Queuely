from __future__ import annotations

from openai import OpenAI

from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError


settings = get_settings()


def _client() -> OpenAI:
    if not settings.openai_api_key:
        raise QueuelyError("missing_openai_key", "OPENAI_API_KEY is not configured.", status_code=500)
    return OpenAI(api_key=settings.openai_api_key)


def embed_text(text: str) -> list[float]:
    # Keep calls small and deterministic; callers should chunk input.
    resp = _client().embeddings.create(model=settings.openai_embedding_model, input=text)
    return list(resp.data[0].embedding)

