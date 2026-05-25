from __future__ import annotations

import os
import time

import pytest

from queuely.db.session import SessionLocal
from queuely.models.context import ConversationMessage, DebugSession, FileChunk, MessageRole, UploadedFile, UploadedFileStatus
from queuely.models.user import User
from queuely.services.retrieval import retrieve_similar_file_chunks, retrieve_similar_messages
from queuely.services.security import hash_password


def _vec(dim: int, index: int) -> list[float]:
    v = [0.0] * dim
    v[index] = 1.0
    return v


def test_retrieval_returns_expected_top_hit() -> None:
    if os.environ.get("QUEUELY_TEST_DISABLE_OPENAI") != "1":
        pytest.skip("Retrieval integration test is intended for docker harness runs.")

    dim = 1536
    unique = int(time.time())

    with SessionLocal() as session:
        user = User(email=f"retrieval_{unique}@example.com", password_hash=hash_password("Password123!"), is_active=True, is_superuser=False)
        session.add(user)
        session.flush()

        debug_session = DebugSession(user_id=user.id, title="retrieval", model_name="gpt-4.1-mini")
        session.add(debug_session)
        session.flush()

        msg_a = ConversationMessage(
            session_id=debug_session.id,
            user_id=user.id,
            role=MessageRole.user,
            content="alpha",
            sequence_number=1,
            embedding=_vec(dim, 0),
        )
        msg_b = ConversationMessage(
            session_id=debug_session.id,
            user_id=user.id,
            role=MessageRole.user,
            content="beta",
            sequence_number=2,
            embedding=_vec(dim, 1),
        )
        session.add_all([msg_a, msg_b])

        uploaded = UploadedFile(
            user_id=user.id,
            session_id=debug_session.id,
            original_name="x.py",
            storage_path="dummy",
            mime_type="text/plain",
            language="python",
            sha256_hash="0" * 64,
            size_bytes=1,
            status=UploadedFileStatus.ready,
        )
        session.add(uploaded)
        session.flush()

        chunk_a = FileChunk(file_id=uploaded.id, chunk_index=0, content="print('a')", embedding=_vec(dim, 0), language="python")
        chunk_b = FileChunk(file_id=uploaded.id, chunk_index=1, content="print('b')", embedding=_vec(dim, 1), language="python")
        session.add_all([chunk_a, chunk_b])

        session.commit()

    with SessionLocal() as session:
        mem = retrieve_similar_messages(session, user_id=user.id, query_embedding=_vec(dim, 0), top_k=1)
        assert mem
        assert mem[0][0].content == "alpha"

        chunks = retrieve_similar_file_chunks(session, user_id=user.id, query_embedding=_vec(dim, 0), top_k=1)
        assert chunks
        assert chunks[0][0].content == "print('a')"

