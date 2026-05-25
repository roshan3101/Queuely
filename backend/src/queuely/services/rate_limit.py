from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError
from queuely.models.rate_limit import RateLimitBucket


settings = get_settings()


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    remaining: int
    limit: int
    reset_seconds: int


def _refill_tokens(
    now: datetime,
    last_refill_at: datetime,
    tokens: float,
    capacity: int,
    refill_rate: float,
) -> float:
    elapsed = (now - last_refill_at).total_seconds()
    if elapsed <= 0:
        return tokens
    return min(float(capacity), tokens + elapsed * refill_rate)


def _reset_seconds(now: datetime, tokens: float, capacity: int, refill_rate: float) -> int:
    if tokens >= 1.0:
        return 0
    if refill_rate <= 0:
        return 3600
    seconds = (1.0 - tokens) / refill_rate
    return max(1, int(seconds))


def consume_token(
    session: Session,
    *,
    user_id: str,
    bucket_name: str = "job_submission",
    capacity: int | None = None,
    refill_rate: float | None = None,
) -> RateLimitDecision:
    now = datetime.now(UTC)
    effective_capacity = capacity if capacity is not None else settings.rate_limit_capacity
    effective_refill_rate = refill_rate if refill_rate is not None else settings.rate_limit_refill_rate

    if effective_capacity <= 0:
        return RateLimitDecision(allowed=True, remaining=0, limit=0, reset_seconds=0)

    stmt = (
        select(RateLimitBucket)
        .where(RateLimitBucket.user_id == user_id, RateLimitBucket.bucket_name == bucket_name)
        .with_for_update()
    )
    bucket = session.scalar(stmt)

    if bucket is None:
        bucket = RateLimitBucket(
            user_id=user_id,
            bucket_name=bucket_name,
            capacity=effective_capacity,
            refill_rate=effective_refill_rate,
            tokens=float(effective_capacity),
            last_refill_at=now,
        )
        session.add(bucket)
        session.flush()

    # Keep configuration in sync with settings by default.
    bucket.capacity = effective_capacity
    bucket.refill_rate = effective_refill_rate

    bucket.tokens = _refill_tokens(now, bucket.last_refill_at, bucket.tokens, bucket.capacity, bucket.refill_rate)
    bucket.last_refill_at = now

    if bucket.tokens >= 1.0:
        bucket.tokens -= 1.0
        remaining = int(bucket.tokens)
        decision = RateLimitDecision(
            allowed=True,
            remaining=remaining,
            limit=bucket.capacity,
            reset_seconds=_reset_seconds(now, bucket.tokens, bucket.capacity, bucket.refill_rate),
        )
        session.commit()
        return decision

    decision = RateLimitDecision(
        allowed=False,
        remaining=0,
        limit=bucket.capacity,
        reset_seconds=_reset_seconds(now, bucket.tokens, bucket.capacity, bucket.refill_rate),
    )
    session.commit()
    return decision


def enforce_rate_limit(
    session: Session,
    *,
    user_id: str,
    bucket_name: str = "job_submission",
) -> RateLimitDecision:
    decision = consume_token(session, user_id=user_id, bucket_name=bucket_name)
    if not decision.allowed:
        raise QueuelyError("rate_limited", "Rate limit exceeded.", status_code=429)
    return decision
