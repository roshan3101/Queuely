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


def _fit_lines(model: str, lines: list[str], budget: int) -> list[str]:
    fitted: list[str] = []
    used = 0
    for line in lines:
        tokens = estimate_tokens(model, line) + 1
        if used + tokens > budget:
            break
        fitted.append(line)
        used += tokens
    return fitted


def clamp_prompt(
    *,
    model: str,
    system_prompt: str,
    retrieved_memory: list[str],
    retrieved_chunks: list[str],
    recent_messages: list[PromptPiece],
    conversation_summary: str | None = None,
    max_input_tokens: int | None = None,
) -> list[dict[str, str]]:
    total_limit = max_input_tokens if max_input_tokens is not None else settings.prompt_max_input_tokens
    effective_limit = max(256, total_limit - settings.prompt_response_headroom_tokens)

    system_text = truncate_to_tokens(model, system_prompt.strip(), settings.prompt_system_budget_tokens)
    pieces: list[PromptPiece] = [PromptPiece(role="system", content=system_text)]

    if conversation_summary:
        summary_text = truncate_to_tokens(model, conversation_summary.strip(), settings.prompt_summary_budget_tokens)
        if summary_text:
            pieces.append(PromptPiece(role="system", content=f"Conversation summary:\n{summary_text}"))

    if retrieved_memory:
        memory_lines = _fit_lines(model, retrieved_memory, settings.prompt_memory_budget_tokens)
        if memory_lines:
            pieces.append(PromptPiece(role="system", content="Relevant past exchanges:\n" + "\n\n".join(memory_lines)))

    if retrieved_chunks:
        chunk_lines = _fit_lines(model, retrieved_chunks, settings.prompt_code_budget_tokens)
        if chunk_lines:
            pieces.append(PromptPiece(role="system", content="Relevant code/context snippets:\n" + "\n\n".join(chunk_lines)))

    history_budget = settings.prompt_history_budget_tokens
    history: list[PromptPiece] = []
    used_history = 0
    for message in reversed(recent_messages):
        message_tokens = estimate_tokens(model, message.content) + 4
        if used_history + message_tokens > history_budget:
            continue
        history.append(message)
        used_history += message_tokens
    history.reverse()
    pieces.extend(history)

    while True:
        total_tokens = sum(estimate_tokens(model, piece.content) + 4 for piece in pieces)
        if total_tokens <= effective_limit:
            break
        removable_indexes = [index for index, piece in enumerate(pieces) if piece.role != "system"]
        if removable_indexes:
            pieces.pop(removable_indexes[0])
            continue
        if len(pieces) > 1:
            pieces.pop()
            continue
        pieces[0] = PromptPiece(role="system", content=truncate_to_tokens(model, pieces[0].content, max(1, effective_limit - 4)))
        break

    return [{"role": piece.role, "content": piece.content} for piece in pieces]
