from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from queuely.core.config import get_settings
from queuely.models.context import ConversationMessage, FileChunk, MessageRole


settings = get_settings()


def _normalized_key(text: str) -> str:
    return " ".join(text.lower().split())


def _recency_multiplier(created_at: datetime | None) -> float:
    if created_at is None:
        return 1.0
    now = datetime.now(UTC)
    age_seconds = max(0.0, (now - created_at).total_seconds())
    half_life_seconds = max(1, settings.retrieval_recency_half_life_hours) * 3600.0
    decay = math.exp(-math.log(2.0) * (age_seconds / half_life_seconds))
    return 1.0 + (settings.retrieval_recency_boost_factor * decay)


def _content_is_valuable(text: str) -> bool:
    return len(text.strip()) >= settings.retrieval_min_content_length


def _rerank_and_filter[T](
    rows: Iterable[tuple[T, float]],
    *,
    top_k: int,
    content_getter,
    created_at_getter,
) -> list[tuple[T, float]]:
    candidates: list[tuple[str, T, float, float]] = []
    min_similarity = settings.retrieval_min_similarity_score

    for item, distance in rows:
        content = str(content_getter(item) or "").strip()
        if not _content_is_valuable(content):
            continue
        dedupe_key = _normalized_key(content)
        similarity = max(0.0, 1.0 - float(distance))
        if similarity < min_similarity:
            continue
        recency_weight = _recency_multiplier(created_at_getter(item))
        candidates.append((dedupe_key, item, float(distance), similarity * recency_weight))

    candidates.sort(key=lambda row: row[3], reverse=True)
    ranked: list[tuple[T, float]] = []
    seen: set[str] = set()
    for dedupe_key, item, distance, _score in candidates:
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        ranked.append((item, distance))
        if len(ranked) >= top_k:
            break
    return ranked


def retrieve_similar_messages(
    session: Session,
    *,
    user_id: str,
    query_embedding: list[float],
    top_k: int | None = None,
) -> list[tuple[ConversationMessage, float]]:
    k = top_k if top_k is not None else settings.retrieval_top_k
    candidate_limit = max(k, settings.retrieval_candidate_limit)
    distance = ConversationMessage.embedding.cosine_distance(query_embedding)  # type: ignore[attr-defined]
    stmt = (
        select(ConversationMessage, distance.label("distance"))
        .where(
            ConversationMessage.user_id == user_id,
            ConversationMessage.embedding.is_not(None),
            ConversationMessage.role.in_([MessageRole.user, MessageRole.assistant]),
        )
        .order_by(distance.asc())
        .limit(candidate_limit)
    )
    rows = [(msg, float(dist)) for msg, dist in session.execute(stmt).all()]
    return _rerank_and_filter(
        rows,
        top_k=k,
        content_getter=lambda msg: msg.content,
        created_at_getter=lambda msg: msg.created_at,
    )


def retrieve_similar_file_chunks(
    session: Session,
    *,
    user_id: str,
    query_embedding: list[float],
    top_k: int | None = None,
) -> list[tuple[FileChunk, float]]:
    k = top_k if top_k is not None else settings.retrieval_top_k
    candidate_limit = max(k, settings.retrieval_candidate_limit)
    distance = FileChunk.embedding.cosine_distance(query_embedding)  # type: ignore[attr-defined]
    stmt = (
        select(FileChunk, distance.label("distance"))
        .join(FileChunk.file)
        .where(
            FileChunk.embedding.is_not(None),
            FileChunk.file.has(user_id=user_id),
        )
        .order_by(distance.asc())
        .limit(candidate_limit)
    )
    rows = [(chunk, float(dist)) for chunk, dist in session.execute(stmt).all()]
    return _rerank_and_filter(
        rows,
        top_k=k,
        content_getter=lambda chunk: chunk.content,
        created_at_getter=lambda chunk: chunk.created_at,
    )
