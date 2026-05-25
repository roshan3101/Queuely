"""add_ai_context_schema"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = '38c90200b3fe'
down_revision = '20260525_0001'
branch_labels = None
depends_on = None


session_status_enum = postgresql.ENUM(
    "active",
    "archived",
    "deleted",
    name="session_status_enum",
)
message_role_enum = postgresql.ENUM(
    "system",
    "user",
    "assistant",
    "tool",
    name="message_role_enum",
)
uploaded_file_status_enum = postgresql.ENUM(
    "pending",
    "processing",
    "ready",
    "failed",
    "deleted",
    name="uploaded_file_status_enum",
)
response_source_type_enum = postgresql.ENUM(
    "memory_message",
    "file_chunk",
    name="response_source_type_enum",
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    session_status_enum.create(op.get_bind(), checkfirst=True)
    message_role_enum.create(op.get_bind(), checkfirst=True)
    uploaded_file_status_enum.create(op.get_bind(), checkfirst=True)
    response_source_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "debug_sessions",
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", postgresql.ENUM(name="session_status_enum", create_type=False), nullable=False, server_default="active"),
        sa.Column("model_name", sa.String(length=100), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_debug_sessions_user_id", "debug_sessions", ["user_id"], unique=False)
    op.create_index("ix_debug_sessions_status", "debug_sessions", ["status"], unique=False)
    op.create_index("ix_debug_sessions_user_last_message_at", "debug_sessions", ["user_id", "last_message_at"], unique=False)
    op.create_index("ix_debug_sessions_user_created_at", "debug_sessions", ["user_id", "created_at"], unique=False)

    op.create_table(
        "conversation_messages",
        sa.Column("session_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("role", postgresql.ENUM(name="message_role_enum", create_type=False), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("response_to_message_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["response_to_message_id"], ["conversation_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["debug_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_id", "sequence_number", name="uq_conversation_messages_session_sequence"),
    )
    op.create_index("ix_conversation_messages_session_id", "conversation_messages", ["session_id"], unique=False)
    op.create_index("ix_conversation_messages_user_id", "conversation_messages", ["user_id"], unique=False)
    op.create_index("ix_conversation_messages_role", "conversation_messages", ["role"], unique=False)
    op.create_index("ix_conversation_messages_session_sequence", "conversation_messages", ["session_id", "sequence_number"], unique=False)
    op.create_index("ix_conversation_messages_user_created_at", "conversation_messages", ["user_id", "created_at"], unique=False)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_conversation_messages_embedding_hnsw "
        "ON conversation_messages USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "uploaded_files",
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("original_name", sa.String(length=512), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("language", sa.String(length=64), nullable=True),
        sa.Column("sha256_hash", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", postgresql.ENUM(name="uploaded_file_status_enum", create_type=False), nullable=False, server_default="pending"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["debug_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_uploaded_files_user_id", "uploaded_files", ["user_id"], unique=False)
    op.create_index("ix_uploaded_files_session_id", "uploaded_files", ["session_id"], unique=False)
    op.create_index("ix_uploaded_files_language", "uploaded_files", ["language"], unique=False)
    op.create_index("ix_uploaded_files_sha256_hash", "uploaded_files", ["sha256_hash"], unique=False)
    op.create_index("ix_uploaded_files_status", "uploaded_files", ["status"], unique=False)
    op.create_index("ix_uploaded_files_user_created_at", "uploaded_files", ["user_id", "created_at"], unique=False)
    op.create_index("ix_uploaded_files_session_status", "uploaded_files", ["session_id", "status"], unique=False)

    op.create_table(
        "file_chunks",
        sa.Column("file_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("language", sa.String(length=64), nullable=True),
        sa.Column("start_line", sa.Integer(), nullable=True),
        sa.Column("end_line", sa.Integer(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["file_id"], ["uploaded_files.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("file_id", "chunk_index", name="uq_file_chunks_file_chunk_index"),
    )
    op.create_index("ix_file_chunks_file_id", "file_chunks", ["file_id"], unique=False)
    op.create_index("ix_file_chunks_file_chunk_index", "file_chunks", ["file_id", "chunk_index"], unique=False)
    op.create_index("ix_file_chunks_language_created_at", "file_chunks", ["language", "created_at"], unique=False)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_file_chunks_embedding_hnsw "
        "ON file_chunks USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "response_references",
        sa.Column("assistant_message_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("source_type", postgresql.ENUM(name="response_source_type_enum", create_type=False), nullable=False),
        sa.Column("referenced_message_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("referenced_file_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("referenced_chunk_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assistant_message_id"], ["conversation_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["referenced_chunk_id"], ["file_chunks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["referenced_file_id"], ["uploaded_files.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["referenced_message_id"], ["conversation_messages.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_response_references_assistant_message_id", "response_references", ["assistant_message_id"], unique=False)
    op.create_index("ix_response_references_source_type", "response_references", ["source_type"], unique=False)
    op.create_index("ix_response_references_referenced_message_id", "response_references", ["referenced_message_id"], unique=False)
    op.create_index("ix_response_references_referenced_file_id", "response_references", ["referenced_file_id"], unique=False)
    op.create_index("ix_response_references_referenced_chunk_id", "response_references", ["referenced_chunk_id"], unique=False)
    op.create_index("ix_response_references_assistant_message_rank", "response_references", ["assistant_message_id", "rank"], unique=False)
    op.create_index("ix_response_references_source_type_created_at", "response_references", ["source_type", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_response_references_source_type_created_at", table_name="response_references")
    op.drop_index("ix_response_references_assistant_message_rank", table_name="response_references")
    op.drop_index("ix_response_references_referenced_chunk_id", table_name="response_references")
    op.drop_index("ix_response_references_referenced_file_id", table_name="response_references")
    op.drop_index("ix_response_references_referenced_message_id", table_name="response_references")
    op.drop_index("ix_response_references_source_type", table_name="response_references")
    op.drop_index("ix_response_references_assistant_message_id", table_name="response_references")
    op.drop_table("response_references")

    op.execute("DROP INDEX IF EXISTS ix_file_chunks_embedding_hnsw")
    op.drop_index("ix_file_chunks_language_created_at", table_name="file_chunks")
    op.drop_index("ix_file_chunks_file_chunk_index", table_name="file_chunks")
    op.drop_index("ix_file_chunks_file_id", table_name="file_chunks")
    op.drop_table("file_chunks")

    op.drop_index("ix_uploaded_files_session_status", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_user_created_at", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_status", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_sha256_hash", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_language", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_session_id", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_user_id", table_name="uploaded_files")
    op.drop_table("uploaded_files")

    op.execute("DROP INDEX IF EXISTS ix_conversation_messages_embedding_hnsw")
    op.drop_index("ix_conversation_messages_user_created_at", table_name="conversation_messages")
    op.drop_index("ix_conversation_messages_session_sequence", table_name="conversation_messages")
    op.drop_index("ix_conversation_messages_role", table_name="conversation_messages")
    op.drop_index("ix_conversation_messages_user_id", table_name="conversation_messages")
    op.drop_index("ix_conversation_messages_session_id", table_name="conversation_messages")
    op.drop_table("conversation_messages")

    op.drop_index("ix_debug_sessions_user_created_at", table_name="debug_sessions")
    op.drop_index("ix_debug_sessions_user_last_message_at", table_name="debug_sessions")
    op.drop_index("ix_debug_sessions_status", table_name="debug_sessions")
    op.drop_index("ix_debug_sessions_user_id", table_name="debug_sessions")
    op.drop_table("debug_sessions")

    response_source_type_enum.drop(op.get_bind(), checkfirst=True)
    uploaded_file_status_enum.drop(op.get_bind(), checkfirst=True)
    message_role_enum.drop(op.get_bind(), checkfirst=True)
    session_status_enum.drop(op.get_bind(), checkfirst=True)
