from __future__ import annotations

import asyncio
import json
import logging

from redis.asyncio import Redis

from queuely.websocket.manager import WebSocketManager


logger = logging.getLogger(__name__)


async def run_fanout(redis_client: Redis, manager: WebSocketManager, stop_event: asyncio.Event) -> None:
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("jobs.events")
    try:
        while not stop_event.is_set():
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if not message:
                continue
            try:
                payload = json.loads(message["data"])
            except Exception:
                continue

            user_id = payload.get("user_id")
            if user_id:
                await manager.send_to_user(str(user_id), payload)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Redis fanout loop crashed")
    finally:
        try:
            await pubsub.unsubscribe("jobs.events")
        finally:
            await pubsub.aclose()
