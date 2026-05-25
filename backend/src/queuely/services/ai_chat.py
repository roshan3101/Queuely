from __future__ import annotations

from collections.abc import Callable, Iterable

from openai import OpenAI

from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError


settings = get_settings()


def _client() -> OpenAI:
    if not settings.openai_api_key:
        raise QueuelyError("missing_openai_key", "OPENAI_API_KEY is not configured.", status_code=500)
    return OpenAI(api_key=settings.openai_api_key)


def complete(messages: list[dict[str, str]]) -> str:
    resp = _client().chat.completions.create(model=settings.openai_model, messages=messages)
    return resp.choices[0].message.content or ""


def stream_complete(
    messages: list[dict[str, str]],
    *,
    should_cancel: Callable[[], bool] | None = None,
) -> Iterable[str]:
    stream = _client().chat.completions.create(model=settings.openai_model, messages=messages, stream=True)
    for event in stream:
        if should_cancel and should_cancel():
            break
        delta = event.choices[0].delta.content
        if delta:
            yield delta
