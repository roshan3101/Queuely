from __future__ import annotations

from fastapi import Depends, Response
from sqlalchemy.orm import Session

from queuely.api.auth import require_active_user
from queuely.api.dependencies import get_db_session
from queuely.models.user import User
from queuely.core.exceptions import QueuelyError
from queuely.services.rate_limit import consume_token


def apply_rate_limit_headers(response: Response, limit: int, remaining: int, reset_seconds: int) -> None:
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(max(0, remaining))
    response.headers["X-RateLimit-Reset"] = str(max(0, reset_seconds))
    if remaining <= 0:
        response.headers["Retry-After"] = str(max(1, reset_seconds))


def rate_limit_job_submission(
    response: Response,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
) -> None:
    decision = consume_token(session, user_id=current_user.id, bucket_name="job_submission")
    apply_rate_limit_headers(response, decision.limit, decision.remaining, decision.reset_seconds)
    if not decision.allowed:
        raise QueuelyError("rate_limited", "Rate limit exceeded.", status_code=429)
