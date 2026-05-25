from datetime import datetime
import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from queuely.db.base import Base
from queuely.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


EMBEDDING_DIMENSION = 1536


class SessionStatus(str, enum.Enum):
    active = "active"
    archived = "archived"
    deleted = "deleted"


class MessageRole(str, enum.Enum):
    system = "system"
    user = "user"
    assistant = "assistant"
    tool = "tool"


class UploadedFileStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    failed = "failed"
    deleted = "deleted"


class ResponseSourceType(str, enum.Enum):
    memory_message = "memory_message"
    file_chunk = "file_chunk"


class DebugSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "debug_sessions"
    __table_args__ = (
        Index("ix_debug_sessions_user_last_message_at", "user_id", "last_message_at"),
        Index("ix_debug_sessions_user_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status_enum"),
        default=SessionStatus.active,
        index=True,
    )
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    user = relationship("User", back_populates="debug_sessions")
    messages = relationship("ConversationMessage", back_populates="session", cascade="all, delete-orphan")
    uploaded_files = relationship("UploadedFile", back_populates="session", cascade="all, delete-orphan")


class ConversationMessage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        Index("ix_conversation_messages_session_sequence", "session_id", "sequence_number"),
        Index("ix_conversation_messages_user_created_at", "user_id", "created_at"),
    )

    session_id: Mapped[str] = mapped_column(ForeignKey("debug_sessions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[MessageRole] = mapped_column(Enum(MessageRole, name="message_role_enum"), index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding: Mapped[object | None] = mapped_column(Vector(EMBEDDING_DIMENSION), nullable=True)
    response_to_message_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversation_messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    user = relationship("User", back_populates="conversation_messages")
    session = relationship("DebugSession", back_populates="messages")
    referenced_sources = relationship(
        "ResponseReference",
        foreign_keys="ResponseReference.assistant_message_id",
        back_populates="assistant_message",
        cascade="all, delete-orphan",
    )


class UploadedFile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "uploaded_files"
    __table_args__ = (
        Index("ix_uploaded_files_user_created_at", "user_id", "created_at"),
        Index("ix_uploaded_files_session_status", "session_id", "status"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str | None] = mapped_column(
        ForeignKey("debug_sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    original_name: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    language: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[UploadedFileStatus] = mapped_column(
        Enum(UploadedFileStatus, name="uploaded_file_status_enum"),
        default=UploadedFileStatus.pending,
        index=True,
    )
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    user = relationship("User", back_populates="uploaded_files")
    session = relationship("DebugSession", back_populates="uploaded_files")
    chunks = relationship("FileChunk", back_populates="file", cascade="all, delete-orphan")


class FileChunk(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "file_chunks"
    __table_args__ = (
        Index("ix_file_chunks_file_chunk_index", "file_id", "chunk_index"),
        Index("ix_file_chunks_language_created_at", "language", "created_at"),
    )

    file_id: Mapped[str] = mapped_column(ForeignKey("uploaded_files.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding: Mapped[object | None] = mapped_column(Vector(EMBEDDING_DIMENSION), nullable=True)
    language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    start_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    file = relationship("UploadedFile", back_populates="chunks")


class ResponseReference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "response_references"
    __table_args__ = (
        Index("ix_response_references_assistant_message_rank", "assistant_message_id", "rank"),
        Index("ix_response_references_source_type_created_at", "source_type", "created_at"),
    )

    assistant_message_id: Mapped[str] = mapped_column(
        ForeignKey("conversation_messages.id", ondelete="CASCADE"),
        index=True,
    )
    source_type: Mapped[ResponseSourceType] = mapped_column(
        Enum(ResponseSourceType, name="response_source_type_enum"),
        index=True,
    )
    referenced_message_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversation_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    referenced_file_id: Mapped[str | None] = mapped_column(
        ForeignKey("uploaded_files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    referenced_chunk_id: Mapped[str | None] = mapped_column(
        ForeignKey("file_chunks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    assistant_message = relationship(
        "ConversationMessage",
        foreign_keys=[assistant_message_id],
        back_populates="referenced_sources",
    )
