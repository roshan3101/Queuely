from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from queuely.core.config import get_settings
from queuely.models.context import ConversationMessage, FileChunk, MessageRole


settings = get_settings()


def retrieve_similar_messages(
    session: Session,
    *,
    user_id: str,
    query_embedding: list[float],
    top_k: int | None = None,
) -> list[tuple[ConversationMessage, float]]:
    k = top_k if top_k is not None else settings.retrieval_top_k
    # cosine_distance is supported by pgvector. Lower is more similar.
    distance = ConversationMessage.embedding.cosine_distance(query_embedding)  # type: ignore[attr-defined]
    stmt = (
        select(ConversationMessage, distance.label("distance"))
        .where(
            ConversationMessage.user_id == user_id,
            ConversationMessage.embedding.is_not(None),
            ConversationMessage.role.in_([MessageRole.user, MessageRole.assistant]),
        )
        .order_by(distance.asc())
        .limit(k)
    )
    rows: list[tuple[ConversationMessage, float]] = []
    for msg, dist in session.execute(stmt).all():
        rows.append((msg, float(dist)))
    return rows


def retrieve_similar_file_chunks(
    session: Session,
    *,
    user_id: str,
    query_embedding: list[float],
    top_k: int | None = None,
) -> list[tuple[FileChunk, float]]:
    k = top_k if top_k is not None else settings.retrieval_top_k
    distance = FileChunk.embedding.cosine_distance(query_embedding)  # type: ignore[attr-defined]
    stmt = (
        select(FileChunk, distance.label("distance"))
        .join(FileChunk.file)
        .where(FileChunk.embedding.is_not(None), FileChunk.file.has(user_id=user_id))
        .order_by(distance.asc())
        .limit(k)
    )
    rows: list[tuple[FileChunk, float]] = []
    for chunk, dist in session.execute(stmt).all():
        rows.append((chunk, float(dist)))
    return rows

