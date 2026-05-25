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


def truncate_to_tokens(model: str, text: str, token_limit: int) -> str:
    encoder = _encoder(model)
    token_ids = encoder.encode(text)
    if len(token_ids) <= token_limit:
        return text
    return encoder.decode(token_ids[:token_limit])


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
    system_piece = PromptPiece(role="system", content=system_prompt.strip())
    memory_piece = None
    chunk_piece = None
    recent_pieces = list(recent_messages)

    if retrieved_memory:
        memory_block = "Relevant past exchanges:\n" + "\n\n".join(retrieved_memory)
        memory_piece = PromptPiece(role="system", content=memory_block)

    if retrieved_chunks:
        chunk_block = "Relevant code/context snippets:\n" + "\n\n".join(retrieved_chunks)
        chunk_piece = PromptPiece(role="system", content=chunk_block)

    pieces: list[PromptPiece] = [system_piece]
    if memory_piece:
        pieces.append(memory_piece)
    if chunk_piece:
        pieces.append(chunk_piece)
    pieces.extend(recent_pieces)

    # Drop oldest non-system messages until within limit.
    def tokens_for(p: PromptPiece) -> int:
        return estimate_tokens(model, p.content) + 4

    total = sum(tokens_for(p) for p in pieces)
    if total <= limit:
        return [{"role": p.role, "content": p.content} for p in pieces]

    while total > limit and recent_pieces:
        removed = recent_pieces.pop(0)
        total -= tokens_for(removed)

    pieces = [system_piece]
    if memory_piece:
        pieces.append(memory_piece)
    if chunk_piece:
        pieces.append(chunk_piece)
    pieces.extend(recent_pieces)
    total = sum(tokens_for(p) for p in pieces)

    if total > limit and chunk_piece is not None:
        pieces = [system_piece]
        if memory_piece:
            pieces.append(memory_piece)
        pieces.extend(recent_pieces)
        total = sum(tokens_for(p) for p in pieces)

    if total > limit and memory_piece is not None:
        pieces = [system_piece]
        pieces.extend(recent_pieces)
        total = sum(tokens_for(p) for p in pieces)

    if total > limit:
        available_for_system = max(1, limit - 4)
        truncated_system = truncate_to_tokens(model, system_piece.content, available_for_system)
        return [{"role": "system", "content": truncated_system}]

    return [{"role": p.role, "content": p.content} for p in pieces]
