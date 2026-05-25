from collections.abc import Generator

from fastapi import Request
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from queuely.db.session import SessionLocal


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)
