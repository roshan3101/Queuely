from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from queuely.db.base import Base
from queuely.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class RateLimitBucket(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "rate_limit_buckets"
    __table_args__ = (UniqueConstraint("user_id", "bucket_name", name="uq_rate_limit_buckets_user_bucket"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bucket_name: Mapped[str] = mapped_column(String(255), default="job_submission")
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    refill_rate: Mapped[float] = mapped_column(Float, nullable=False)
    tokens: Mapped[float] = mapped_column(Float, nullable=False)
    last_refill_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="rate_limit_buckets")
