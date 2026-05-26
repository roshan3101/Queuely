from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from queuely.api.dependencies import get_db_session
from queuely.core.exceptions import QueuelyError
from queuely.models.user import User
from queuely.services.security import decode_token


bearer_scheme = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def get_user_agent(user_agent: str | None = Header(default=None)) -> str | None:
    return user_agent


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_db_session),
) -> User:
    if credentials is None:
        raise QueuelyError("authentication_required", "Authentication is required.", 401)
    payload = decode_token(credentials.credentials, "access")
    user = session.get(User, str(payload["sub"]))
    if not user:
        raise QueuelyError("user_not_found", "User does not exist.", 401)
    return user


def require_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise QueuelyError("inactive_user", "This user account is inactive.", 403)
    return current_user


def require_superuser(current_user: User = Depends(require_active_user)) -> User:
    return current_user
