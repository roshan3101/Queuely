from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from queuely.api.auth import require_active_user
from queuely.api.dependencies import get_db_session, get_request_id
from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError
from queuely.core.responses import ApiResponse
from queuely.db.session import SessionLocal
from queuely.models.context import ConversationMessage, DebugSession, MessageRole, ResponseReference, ResponseSourceType
from queuely.models.user import User
from queuely.schemas.context import (
    MessageCreateRequest,
    MessageListRead,
    MessageRead,
    SessionCreateRequest,
    SessionListRead,
    SessionRead,
)
from queuely.services.ai_chat import complete, stream_complete
from queuely.services.ai_embeddings import embed_text
from queuely.services.prompting import PromptPiece, clamp_prompt
from queuely.services.retrieval import retrieve_similar_file_chunks, retrieve_similar_messages


settings = get_settings()
router = APIRouter(prefix="/sessions", tags=["sessions"])


def _serialize_session(row: DebugSession) -> SessionRead:
    return SessionRead(
        id=row.id,
        title=row.title,
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        model_name=row.model_name,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _serialize_message(row: ConversationMessage) -> MessageRead:
    referenced_files = [
        ref.referenced_file_id
        for ref in row.referenced_sources
        if ref.source_type == ResponseSourceType.file_chunk and ref.referenced_file_id
    ]
    return MessageRead(
        id=row.id,
        role=row.role.value if hasattr(row.role, "value") else str(row.role),
        content=row.content,
        sequence_number=row.sequence_number,
        created_at=row.created_at,
        referenced_files=referenced_files,
    )


@router.post("", response_model=ApiResponse[SessionRead], status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreateRequest,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[SessionRead]:
    row = DebugSession(user_id=current_user.id, title=payload.title, model_name=settings.openai_model)
    session.add(row)
    session.commit()
    session.refresh(row)
    return ApiResponse(data=_serialize_session(row), request_id=request_id)


@router.get("", response_model=ApiResponse[SessionListRead])
def list_sessions(
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[SessionListRead]:
    total = session.scalar(select(func.count()).select_from(DebugSession).where(DebugSession.user_id == current_user.id)) or 0
    stmt = (
        select(DebugSession)
        .where(DebugSession.user_id == current_user.id)
        .order_by(DebugSession.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = [_serialize_session(r) for r in session.scalars(stmt)]
    return ApiResponse(data=SessionListRead(items=items, total=total, limit=limit, offset=offset), request_id=request_id)


@router.get("/{session_id}/messages", response_model=ApiResponse[MessageListRead])
def list_messages(
    session_id: str,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[MessageListRead]:
    total = (
        session.scalar(
            select(func.count())
            .select_from(ConversationMessage)
            .where(ConversationMessage.session_id == session_id, ConversationMessage.user_id == current_user.id)
        )
        or 0
    )
    stmt = (
        select(ConversationMessage)
        .where(ConversationMessage.session_id == session_id, ConversationMessage.user_id == current_user.id)
        .order_by(ConversationMessage.sequence_number.asc())
        .limit(limit)
        .offset(offset)
    )
    items = [_serialize_message(r) for r in session.scalars(stmt)]
    return ApiResponse(data=MessageListRead(items=items, total=total, limit=limit, offset=offset), request_id=request_id)


def _next_sequence_number(session: Session, session_id: str) -> int:
    seq = session.scalar(select(func.max(ConversationMessage.sequence_number)).where(ConversationMessage.session_id == session_id))
    return int(seq or 0) + 1


def _compose_prompt(
    db: Session,
    *,
    current_user: User,
    session_row: DebugSession,
    user_message: str,
) -> tuple[list[dict[str, str]], list[tuple[str, object]], list[tuple[str, object]]]:
    query_embedding = embed_text(user_message)

    mem = retrieve_similar_messages(db, user_id=current_user.id, query_embedding=query_embedding, top_k=settings.retrieval_top_k)
    chunks = retrieve_similar_file_chunks(db, user_id=current_user.id, query_embedding=query_embedding, top_k=settings.retrieval_top_k)

    retrieved_memory = [f"[{m.role.value}] {m.content}" for m, _ in mem]
    retrieved_chunks = [c.content for c, _ in chunks]

    # Recent messages from this session only.
    stmt = (
        select(ConversationMessage)
        .where(ConversationMessage.session_id == session_row.id, ConversationMessage.user_id == current_user.id)
        .order_by(ConversationMessage.sequence_number.desc())
        .limit(settings.prompt_recent_messages_limit)
    )
    recent = list(reversed(list(db.scalars(stmt))))
    recent_pieces = [PromptPiece(role=m.role.value, content=m.content) for m in recent]
    recent_pieces.append(PromptPiece(role="user", content=user_message))

    system_prompt = session_row.system_prompt or "You are a senior backend engineer. Be concise and correct."
    messages = clamp_prompt(
        model=session_row.model_name or settings.openai_model,
        system_prompt=system_prompt,
        retrieved_memory=retrieved_memory,
        retrieved_chunks=retrieved_chunks,
        recent_messages=recent_pieces,
        max_input_tokens=settings.prompt_max_input_tokens,
    )

    return messages, mem, chunks


@router.post("/{session_id}/messages", response_model=ApiResponse[MessageRead])
def create_message(
    session_id: str,
    payload: MessageCreateRequest,
    db: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[MessageRead]:
    session_row = db.get(DebugSession, session_id)
    if not session_row or session_row.user_id != current_user.id:
        raise QueuelyError("session_not_found", "Session not found.", status_code=404)

    user_seq = _next_sequence_number(db, session_row.id)
    user_embedding = embed_text(payload.content)
    user_msg = ConversationMessage(
        session_id=session_row.id,
        user_id=current_user.id,
        role=MessageRole.user,
        content=payload.content,
        sequence_number=user_seq,
        token_count=None,
        embedding=user_embedding,
    )
    db.add(user_msg)
    db.flush()

    prompt, mem, chunks = _compose_prompt(db, current_user=current_user, session_row=session_row, user_message=payload.content)
    assistant_text = complete(prompt)

    assistant_seq = user_seq + 1
    assistant_embedding = embed_text(assistant_text) if assistant_text else None
    assistant_msg = ConversationMessage(
        session_id=session_row.id,
        user_id=current_user.id,
        role=MessageRole.assistant,
        content=assistant_text,
        sequence_number=assistant_seq,
        token_count=None,
        embedding=assistant_embedding,
        response_to_message_id=user_msg.id,
    )
    db.add(assistant_msg)
    session_row.last_message_at = datetime.now(UTC)
    db.flush()

    # Persist provenance (best-effort; rank by retrieval order).
    rank = 1
    for m, dist in mem:
        db.add(
            ResponseReference(
                assistant_message_id=assistant_msg.id,
                source_type=ResponseSourceType.memory_message,
                referenced_message_id=m.id,
                rank=rank,
                similarity_score=float(1.0 - dist),
                snippet=m.content[:500],
            )
        )
        rank += 1
    for c, dist in chunks:
        db.add(
            ResponseReference(
                assistant_message_id=assistant_msg.id,
                source_type=ResponseSourceType.file_chunk,
                referenced_file_id=c.file_id,
                referenced_chunk_id=c.id,
                rank=rank,
                similarity_score=float(1.0 - dist),
                snippet=c.content[:500],
            )
        )
        rank += 1

    db.commit()
    db.refresh(assistant_msg)
    return ApiResponse(data=_serialize_message(assistant_msg), request_id=request_id)


@router.post("/{session_id}/messages/stream", response_model=None, status_code=status.HTTP_200_OK)
def stream_message(
    session_id: str,
    payload: MessageCreateRequest,
    db: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
) -> StreamingResponse:
    session_row = db.get(DebugSession, session_id)
    if not session_row or session_row.user_id != current_user.id:
        raise QueuelyError("session_not_found", "Session not found.", status_code=404)

    user_seq = _next_sequence_number(db, session_row.id)
    user_embedding = embed_text(payload.content)
    user_msg = ConversationMessage(
        session_id=session_row.id,
        user_id=current_user.id,
        role=MessageRole.user,
        content=payload.content,
        sequence_number=user_seq,
        embedding=user_embedding,
    )
    db.add(user_msg)
    db.flush()

    prompt, mem, chunks = _compose_prompt(db, current_user=current_user, session_row=session_row, user_message=payload.content)
    assistant_seq = user_seq + 1
    assistant_msg = ConversationMessage(
        session_id=session_row.id,
        user_id=current_user.id,
        role=MessageRole.assistant,
        content="",
        sequence_number=assistant_seq,
        response_to_message_id=user_msg.id,
    )
    db.add(assistant_msg)
    session_row.last_message_at = datetime.now(UTC)
    db.commit()

    assistant_id = assistant_msg.id

    def gen() -> Iterator[bytes]:
        # SSE: emit assistant_message_id then deltas.
        yield f"event: meta\ndata: {assistant_id}\n\n".encode("utf-8")
        full = []
        for delta in stream_complete(prompt):
            full.append(delta)
            yield f"event: delta\ndata: {delta}\n\n".encode("utf-8")
        text = "".join(full)
        # Persist final content, embeddings, and provenance once.
        with SessionLocal() as write_session:
            assistant = write_session.get(ConversationMessage, assistant_id)
            if assistant is not None:
                assistant.content = text
                assistant.embedding = embed_text(text) if text else None
                rank = 1
                for message, dist in mem:
                    write_session.add(
                        ResponseReference(
                            assistant_message_id=assistant.id,
                            source_type=ResponseSourceType.memory_message,
                            referenced_message_id=message.id,
                            rank=rank,
                            similarity_score=float(1.0 - dist),
                            snippet=message.content[:500],
                        )
                    )
                    rank += 1
                for chunk, dist in chunks:
                    write_session.add(
                        ResponseReference(
                            assistant_message_id=assistant.id,
                            source_type=ResponseSourceType.file_chunk,
                            referenced_file_id=chunk.file_id,
                            referenced_chunk_id=chunk.id,
                            rank=rank,
                            similarity_score=float(1.0 - dist),
                            snippet=chunk.content[:500],
                        )
                    )
                    rank += 1
                write_session.commit()
        yield b"event: done\ndata: ok\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
