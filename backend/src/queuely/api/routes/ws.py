from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.security.utils import get_authorization_scheme_param

from queuely.core.exceptions import QueuelyError
from queuely.services.security import decode_token


router = APIRouter(tags=["ws"])


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


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
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

    await manager.connect(websocket, user_id=user_id)
    try:
        while True:
            # Keep connection open; client messages are optional for now.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket, user_id=user_id)
