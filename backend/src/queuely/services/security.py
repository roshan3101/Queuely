from datetime import UTC, datetime, timedelta
from uuid import uuid4

from jose import JWTError, jwt
from pwdlib import PasswordHash

from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError


password_hasher = PasswordHash.recommended()
settings = get_settings()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def _expires_at(minutes: int) -> datetime:
    return datetime.now(UTC) + timedelta(minutes=minutes)


def create_access_token(user_id: str) -> tuple[str, datetime]:
    expires_at = _expires_at(settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": int(expires_at.timestamp()),
        "iat": int(datetime.now(UTC).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_at


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    expires_at = _expires_at(settings.refresh_token_expire_minutes)
    token_jti = str(uuid4())
    payload = {
        "sub": user_id,
        "jti": token_jti,
        "type": "refresh",
        "exp": int(expires_at.timestamp()),
        "iat": int(datetime.now(UTC).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, token_jti, expires_at


def decode_token(token: str, expected_type: str) -> dict[str, object]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise QueuelyError("invalid_token", "Token is invalid or expired.", status_code=401) from exc

    if payload.get("type") != expected_type:
        raise QueuelyError("invalid_token_type", "Token type is invalid.", status_code=401)
    return payload
