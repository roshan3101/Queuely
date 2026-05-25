from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass

from fastapi import WebSocket


@dataclass(frozen=True)
class Connection:
    websocket: WebSocket
    user_id: str


class WebSocketManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._by_user: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, *, user_id: str) -> None:
        await websocket.accept()
        async with self._lock:
            self._by_user.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, websocket: WebSocket, *, user_id: str) -> None:
        async with self._lock:
            sockets = self._by_user.get(user_id)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._by_user.pop(user_id, None)

    async def send_to_user(self, user_id: str, message: dict) -> None:
        text = json.dumps(message, default=str)
        async with self._lock:
            sockets = list(self._by_user.get(user_id, set()))
        for ws in sockets:
            try:
                await ws.send_text(text)
            except Exception:
                # Best-effort: let the next ping/receive loop clean up.
                pass
