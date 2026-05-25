from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.security.utils import get_authorization_scheme_param
from sqlalchemy import select
from sqlalchemy.orm import Session

from queuely.api.dependencies import get_db_session
from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError
from queuely.models.job import Job, JobEvent
from queuely.services.security import decode_token


router = APIRouter(tags=["ws"])
settings = get_settings()


def _extract_token(websocket: WebSocket) -> str | None:
    token = websocket.query_params.get("token")
    if token:
        return token
    auth = websocket.headers.get("authorization")
    if not auth:
        return None
    scheme, param = get_authorization_scheme_param(auth)
    if scheme.lower() != "bearer":
        return None
    return param


def _parse_since(websocket: WebSocket) -> datetime | None:
    raw = websocket.query_params.get("since")
    if not raw:
        return None
    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def _send_replay(*, websocket: WebSocket, db: Session, user_id: str, since: datetime) -> None:
    stmt = (
        select(JobEvent, Job)
        .join(Job, JobEvent.job_id == Job.id)
        .where(Job.user_id == user_id, JobEvent.created_at >= since)
        .order_by(JobEvent.created_at.asc())
        .limit(250)
    )
    for event, job in db.execute(stmt).all():
        message = {
            "type": "job_event",
            "job_id": event.job_id,
            "user_id": user_id,
            "event_type": event.event_type,
            "status": event.status.value if event.status else None,
            "created_at": event.created_at.isoformat(),
            "payload": {
                "message": event.message,
                "metadata": event.meta or {},
                "result": job.result if event.event_type == "job_succeeded" else None,
                "error_message": job.error_message if event.event_type in {"job_failed", "job_dead_lettered"} else None,
            },
            "replayed": True,
        }
        await websocket.send_text(json.dumps(message, default=str))


async def _heartbeat_loop(websocket: WebSocket, connection_id: str) -> None:
    while True:
        await asyncio.sleep(max(5, settings.websocket_ping_interval))
        await websocket.send_text(
            json.dumps(
                {
                    "type": "ping",
                    "connection_id": connection_id,
                    "sent_at": datetime.now(UTC).isoformat(),
                }
            )
        )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db_session)):
    token = _extract_token(websocket)
    if not token:
        await websocket.close(code=4401)
        return

    try:
        payload = decode_token(token, "access")
    except QueuelyError:
        await websocket.close(code=4401)
        return

    user_id = str(payload["sub"])
    manager = websocket.app.state.ws_manager
    connection_id = await manager.connect(websocket, user_id=user_id)
    replay_since = _parse_since(websocket)
    heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket, connection_id))

    try:
        await manager.send_json(
            websocket,
            {
                "type": "connection_ack",
                "connection_id": connection_id,
                "server_time": datetime.now(UTC).isoformat(),
                "reconnect_supported": True,
            },
        )
        if replay_since:
            await _send_replay(websocket=websocket, db=db, user_id=user_id, since=replay_since)

        while True:
            message = await websocket.receive_text()
            if message == "pong":
                continue
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                continue
            if payload.get("type") == "pong":
                continue
            if payload.get("type") == "replay" and replay_since:
                await _send_replay(websocket=websocket, db=db, user_id=user_id, since=replay_since)
    except WebSocketDisconnect:
        pass
    finally:
        heartbeat_task.cancel()
        await manager.disconnect(websocket, user_id=user_id)
