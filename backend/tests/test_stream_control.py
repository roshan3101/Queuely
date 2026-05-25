from __future__ import annotations

from queuely.services.stream_control import StreamCancellationRegistry


def test_stream_cancellation_registry_lifecycle() -> None:
    registry = StreamCancellationRegistry()
    registry.create("message-1")
    assert registry.is_cancelled("message-1") is False
    assert registry.cancel("message-1") is True
    assert registry.is_cancelled("message-1") is True
    registry.clear("message-1")
    assert registry.cancel("message-1") is False
