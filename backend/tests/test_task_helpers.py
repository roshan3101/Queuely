from __future__ import annotations

from queuely.tasks.base import exponential_backoff_seconds


def test_exponential_backoff_grows_and_caps() -> None:
    assert exponential_backoff_seconds(0) == 2
    assert exponential_backoff_seconds(1) == 4
    assert exponential_backoff_seconds(3) == 16
    assert exponential_backoff_seconds(20) == 300

