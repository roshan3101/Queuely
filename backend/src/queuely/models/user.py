from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from queuely.db.base import Base
from queuely.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    jobs = relationship("Job", back_populates="user")
    debug_sessions = relationship("DebugSession", cascade="all, delete-orphan")
    uploaded_files = relationship("UploadedFile", cascade="all, delete-orphan")
    conversation_messages = relationship("ConversationMessage", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", cascade="all, delete-orphan")
    rate_limit_buckets = relationship("RateLimitBucket", back_populates="user", cascade="all, delete-orphan")
