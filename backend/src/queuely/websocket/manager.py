from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from uuid import uuid4

from fastapi import WebSocket


@dataclass(frozen=True)
class Connection:
    websocket: WebSocket
    user_id: str
    connection_id: str


class WebSocketManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._by_user: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, *, user_id: str) -> str:
        await websocket.accept()
        connection_id = str(uuid4())
        async with self._lock:
            self._by_user.setdefault(user_id, {})[connection_id] = websocket
        return connection_id

    async def disconnect(self, websocket: WebSocket, *, user_id: str) -> None:
        async with self._lock:
            sockets = self._by_user.get(user_id)
            if not sockets:
                return
            stale_ids = [connection_id for connection_id, conn in sockets.items() if conn is websocket]
            for connection_id in stale_ids:
                sockets.pop(connection_id, None)
            if not sockets:
                self._by_user.pop(user_id, None)

    async def send_to_user(self, user_id: str, message: dict) -> None:
        text = json.dumps(message, default=str)
        async with self._lock:
            sockets = list(self._by_user.get(user_id, {}).values())
        for ws in sockets:
            try:
                await ws.send_text(text)
            except Exception:
                pass

    async def send_json(self, websocket: WebSocket, message: dict) -> None:
        await websocket.send_text(json.dumps(message, default=str))
