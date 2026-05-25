from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from queuely.services.retrieval import _rerank_and_filter


def test_rerank_and_filter_deduplicates_and_prefers_recent() -> None:
    now = datetime.now(UTC)
    older = SimpleNamespace(content="same content", created_at=now - timedelta(days=30))
    newer = SimpleNamespace(content="same content", created_at=now - timedelta(hours=1))
    distinct = SimpleNamespace(content="another useful chunk of text", created_at=now - timedelta(days=2))

    rows = [
        (older, 0.05),
        (newer, 0.06),
        (distinct, 0.08),
    ]

    result = _rerank_and_filter(
        rows,
        top_k=2,
        content_getter=lambda item: item.content,
        created_at_getter=lambda item: item.created_at,
    )

    assert len(result) == 2
    assert any(item is newer for item, _ in result)
    assert all(item.content != "same content" or item is newer for item, _ in result)
