from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError
from queuely.models.auth import RefreshToken
from queuely.models.user import User
from queuely.schemas.auth import AuthResponse, TokenPair, UserCreateRequest, UserRead
from queuely.services.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


settings = get_settings()


def serialize_user(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _build_auth_response(user: User, refresh_token: str, access_token: str) -> AuthResponse:
    return AuthResponse(
        user=serialize_user(user),
        tokens=TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.access_token_expire_minutes * 60,
        ),
    )


def register_user(
    session: Session,
    payload: UserCreateRequest,
    user_agent: str | None,
    ip_address: str | None,
) -> AuthResponse:
    existing_user = session.scalar(select(User).where(User.email == payload.email))
    if existing_user:
        raise QueuelyError("email_already_registered", "A user with this email already exists.", 409)

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    session.add(user)
    session.flush()

    access_token, _ = create_access_token(user.id)
    refresh_token, token_jti, expires_at = create_refresh_token(user.id)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_jti=token_jti,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    )
    session.commit()
    session.refresh(user)
    return _build_auth_response(user, refresh_token, access_token)


def authenticate_user(
    session: Session,
    email: str,
    password: str,
    user_agent: str | None,
    ip_address: str | None,
) -> AuthResponse:
    user = session.scalar(select(User).where(User.email == email))
    if not user or not verify_password(password, user.password_hash):
        raise QueuelyError("invalid_credentials", "Email or password is incorrect.", 401)
    if not user.is_active:
        raise QueuelyError("inactive_user", "This user account is inactive.", 403)

    access_token, _ = create_access_token(user.id)
    refresh_token, token_jti, expires_at = create_refresh_token(user.id)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_jti=token_jti,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    )
    session.commit()
    return _build_auth_response(user, refresh_token, access_token)


def rotate_refresh_token(
    session: Session,
    refresh_token: str,
    user_agent: str | None,
    ip_address: str | None,
) -> AuthResponse:
    payload = decode_token(refresh_token, "refresh")
    token_jti = str(payload["jti"])
    user_id = str(payload["sub"])

    token_row = session.scalar(select(RefreshToken).where(RefreshToken.token_jti == token_jti))
    if not token_row or token_row.revoked_at is not None or token_row.expires_at <= datetime.now(UTC):
        raise QueuelyError("refresh_token_invalid", "Refresh token is invalid or revoked.", 401)

    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise QueuelyError("inactive_user", "This user account is inactive.", 403)

    token_row.revoked_at = datetime.now(UTC)
    access_token, _ = create_access_token(user.id)
    new_refresh_token, new_token_jti, expires_at = create_refresh_token(user.id)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_jti=new_token_jti,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    )
    session.commit()
    return _build_auth_response(user, new_refresh_token, access_token)


def revoke_refresh_token(session: Session, refresh_token: str) -> None:
    payload = decode_token(refresh_token, "refresh")
    token_jti = str(payload["jti"])
    token_row = session.scalar(select(RefreshToken).where(RefreshToken.token_jti == token_jti))
    if not token_row:
        raise QueuelyError("refresh_token_invalid", "Refresh token is invalid.", 401)
    if token_row.revoked_at is None:
        token_row.revoked_at = datetime.now(UTC)
        session.commit()
