from __future__ import annotations

from threading import Event, Lock


class StreamCancellationRegistry:
    def __init__(self) -> None:
        self._events: dict[str, Event] = {}
        self._lock = Lock()

    def create(self, stream_id: str) -> None:
        with self._lock:
            self._events[stream_id] = Event()

    def cancel(self, stream_id: str) -> bool:
        with self._lock:
            event = self._events.get(stream_id)
            if event is None:
                return False
            event.set()
            return True

    def is_cancelled(self, stream_id: str) -> bool:
        with self._lock:
            event = self._events.get(stream_id)
            return bool(event and event.is_set())

    def clear(self, stream_id: str) -> None:
        with self._lock:
            self._events.pop(stream_id, None)


stream_cancellation_registry = StreamCancellationRegistry()
