from __future__ import annotations

from dataclasses import dataclass

import tiktoken

from queuely.core.config import get_settings


settings = get_settings()


@dataclass(frozen=True)
class PromptPiece:
    role: str
    content: str


def _encoder(model: str):
    try:
        return tiktoken.encoding_for_model(model)
    except Exception:
        return tiktoken.get_encoding("cl100k_base")


def estimate_tokens(model: str, text: str) -> int:
    return len(_encoder(model).encode(text))


def clamp_prompt(
    *,
    model: str,
    system_prompt: str,
    retrieved_memory: list[str],
    retrieved_chunks: list[str],
    recent_messages: list[PromptPiece],
    max_input_tokens: int | None = None,
) -> list[dict[str, str]]:
    limit = max_input_tokens if max_input_tokens is not None else settings.prompt_max_input_tokens
    pieces: list[PromptPiece] = [PromptPiece(role="system", content=system_prompt.strip())]

    if retrieved_memory:
        memory_block = "Relevant past exchanges:\n" + "\n\n".join(retrieved_memory)
        pieces.append(PromptPiece(role="system", content=memory_block))

    if retrieved_chunks:
        chunk_block = "Relevant code/context snippets:\n" + "\n\n".join(retrieved_chunks)
        pieces.append(PromptPiece(role="system", content=chunk_block))

    # Add recent messages last (most important).
    pieces.extend(recent_messages)

    # Drop oldest non-system messages until within limit.
    def tokens_for(p: PromptPiece) -> int:
        return estimate_tokens(model, p.content) + 4

    total = sum(tokens_for(p) for p in pieces)
    if total <= limit:
        return [{"role": p.role, "content": p.content} for p in pieces]

    # Remove from the start of recent_messages section first.
    i = 0
    base = pieces[: 1 + (1 if retrieved_memory else 0) + (1 if retrieved_chunks else 0)]
    tail = pieces[len(base) :]
    while total > limit and i < len(tail):
        total -= tokens_for(tail[i])
        i += 1
    pruned = base + tail[i:]
    return [{"role": p.role, "content": p.content} for p in pruned]

