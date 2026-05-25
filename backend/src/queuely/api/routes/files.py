from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from queuely.api.auth import require_active_user
from queuely.api.dependencies import get_db_session, get_request_id
from queuely.core.responses import ApiResponse
from queuely.models.context import DebugSession, FileChunk, UploadedFile, UploadedFileStatus
from queuely.models.user import User
from queuely.schemas.context import FileUploadResponse
from queuely.services.ai_embeddings import embed_text


router = APIRouter(prefix="/files", tags=["files"])


def _storage_root() -> Path:
    # Local-dev storage; production should move to object storage.
    return Path("backend") / "storage" / "uploads"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _guess_language(filename: str) -> str | None:
    ext = os.path.splitext(filename.lower())[1]
    return {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".jsx": "jsx",
        ".json": "json",
        ".md": "markdown",
        ".sql": "sql",
        ".yml": "yaml",
        ".yaml": "yaml",
    }.get(ext)


def _chunk_lines(text: str, *, lines_per_chunk: int = 200) -> list[tuple[int, int, str]]:
    lines = text.splitlines()
    chunks: list[tuple[int, int, str]] = []
    for i in range(0, len(lines), lines_per_chunk):
        start = i + 1
        end = min(len(lines), i + lines_per_chunk)
        content = "\n".join(lines[i:end])
        chunks.append((start, end, content))
    return chunks


@router.post("", response_model=ApiResponse[FileUploadResponse], status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    db: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[FileUploadResponse]:
    if session_id:
        session_row = db.get(DebugSession, session_id)
        if not session_row or session_row.user_id != current_user.id:
            session_id = None

    data = await file.read()
    digest = _sha256(data)
    language = _guess_language(file.filename or "")

    root = _storage_root() / current_user.id
    root.mkdir(parents=True, exist_ok=True)
    storage_path = root / f"{digest}_{file.filename or 'upload.bin'}"
    storage_path.write_bytes(data)

    row = UploadedFile(
        user_id=current_user.id,
        session_id=session_id,
        original_name=file.filename or "upload.bin",
        storage_path=str(storage_path),
        mime_type=file.content_type,
        language=language,
        sha256_hash=digest,
        size_bytes=len(data),
        status=UploadedFileStatus.processing,
    )
    db.add(row)
    db.flush()

    # Chunk + embed synchronously for now (local dev).
    try:
        text = data.decode("utf-8", errors="replace")
        chunks = _chunk_lines(text)
        for idx, (start, end, content) in enumerate(chunks):
            emb = embed_text(content)
            db.add(
                FileChunk(
                    file_id=row.id,
                    chunk_index=idx,
                    content=content,
                    embedding=emb,
                    language=language,
                    start_line=start,
                    end_line=end,
                )
            )
        row.status = UploadedFileStatus.ready
    except Exception:
        row.status = UploadedFileStatus.failed

    db.commit()
    return ApiResponse(
        data=FileUploadResponse(file_id=row.id, status=row.status.value, original_name=row.original_name, size_bytes=row.size_bytes),
        request_id=request_id,
    )

