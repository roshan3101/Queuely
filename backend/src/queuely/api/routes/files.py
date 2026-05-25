from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from queuely.api.auth import require_active_user
from queuely.api.dependencies import get_db_session, get_request_id
from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError
from queuely.core.responses import ApiResponse
from queuely.models.context import DebugSession, FileChunk, UploadedFile, UploadedFileStatus
from queuely.models.user import User
from queuely.schemas.context import FileDeleteResponse, FileListRead, FileRead, FileUploadResponse
from queuely.services.ai_embeddings import embed_text


router = APIRouter(prefix="/files", tags=["files"])
settings = get_settings()
ALLOWED_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".json",
    ".md",
    ".sql",
    ".yaml",
    ".yml",
    ".txt",
    ".toml",
    ".cfg",
    ".ini",
    ".css",
    ".html",
}
DISALLOWED_MAGIC_PREFIXES = (b"MZ", b"\x7fELF", b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf")


def _storage_root() -> Path:
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


def _validate_upload(filename: str, data: bytes) -> None:
    size_bytes = len(data)
    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        raise QueuelyError("unsupported_file_type", f"Unsupported file type: {ext or 'unknown'}.", status_code=400)
    if size_bytes > settings.max_upload_size_bytes:
        raise QueuelyError("file_too_large", "Uploaded file exceeds the configured size limit.", status_code=413)
    if any(data.startswith(prefix) for prefix in DISALLOWED_MAGIC_PREFIXES):
        raise QueuelyError("unsafe_file_content", "Executable or binary file signatures are not allowed.", status_code=400)
    if b"\x00" in data:
        raise QueuelyError("unsafe_file_content", "Binary file content is not allowed.", status_code=400)


def _serialize_file(row: UploadedFile) -> FileRead:
    return FileRead(
        id=row.id,
        session_id=row.session_id,
        original_name=row.original_name,
        language=row.language,
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        size_bytes=row.size_bytes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _resolve_session_id(db: Session, current_user: User, session_id: str | None) -> str | None:
    if not session_id:
        return None
    session_row = db.get(DebugSession, session_id)
    if not session_row or session_row.user_id != current_user.id:
        return None
    return session_id


def _replace_file_chunks(
    db: Session,
    *,
    row: UploadedFile,
    data: bytes,
    original_name: str,
    content_type: str | None,
    session_id: str | None,
) -> None:
    digest = _sha256(data)
    language = _guess_language(original_name)

    root = _storage_root() / row.user_id
    root.mkdir(parents=True, exist_ok=True)
    storage_path = root / f"{digest}_{original_name}"
    storage_path.write_bytes(data)

    old_storage_path = Path(row.storage_path) if row.storage_path else None
    for chunk in list(row.chunks):
        db.delete(chunk)
    db.flush()

    row.session_id = session_id
    row.original_name = original_name
    row.storage_path = str(storage_path)
    row.mime_type = content_type
    row.language = language
    row.sha256_hash = digest
    row.size_bytes = len(data)
    row.status = UploadedFileStatus.processing

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
    if old_storage_path and old_storage_path != storage_path and old_storage_path.exists():
        old_storage_path.unlink()


@router.get("", response_model=ApiResponse[FileListRead])
def list_files(
    db: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[FileListRead]:
    total = db.scalar(
        select(func.count()).select_from(UploadedFile).where(
            UploadedFile.user_id == current_user.id,
            UploadedFile.status != UploadedFileStatus.deleted,
        )
    ) or 0
    stmt = (
        select(UploadedFile)
        .where(UploadedFile.user_id == current_user.id, UploadedFile.status != UploadedFileStatus.deleted)
        .order_by(UploadedFile.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = [_serialize_file(row) for row in db.scalars(stmt)]
    return ApiResponse(data=FileListRead(items=items, total=total, limit=limit, offset=offset), request_id=request_id)


@router.post("", response_model=ApiResponse[FileUploadResponse], status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    db: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[FileUploadResponse]:
    resolved_session_id = _resolve_session_id(db, current_user, session_id)
    data = await file.read()
    original_name = file.filename or "upload.bin"
    _validate_upload(original_name, data)

    row = UploadedFile(
        user_id=current_user.id,
        session_id=resolved_session_id,
        original_name=original_name,
        storage_path="",
        mime_type=file.content_type,
        language=_guess_language(original_name),
        sha256_hash="",
        size_bytes=len(data),
        status=UploadedFileStatus.processing,
    )
    db.add(row)
    db.flush()

    try:
        _replace_file_chunks(
            db,
            row=row,
            data=data,
            original_name=original_name,
            content_type=file.content_type,
            session_id=resolved_session_id,
        )
    except Exception:
        row.status = UploadedFileStatus.failed
        db.commit()
        raise

    db.commit()
    return ApiResponse(
        data=FileUploadResponse(file_id=row.id, status=row.status.value, original_name=row.original_name, size_bytes=row.size_bytes),
        request_id=request_id,
    )


@router.post("/{file_id}/reindex", response_model=ApiResponse[FileUploadResponse])
async def reindex_file(
    file_id: str,
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    db: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[FileUploadResponse]:
    row = db.get(UploadedFile, file_id)
    if not row or row.user_id != current_user.id or row.status == UploadedFileStatus.deleted:
        raise QueuelyError("file_not_found", "File not found.", status_code=404)

    resolved_session_id = _resolve_session_id(db, current_user, session_id if session_id is not None else row.session_id)
    data = await file.read()
    original_name = file.filename or row.original_name
    _validate_upload(original_name, data)

    try:
        _replace_file_chunks(
            db,
            row=row,
            data=data,
            original_name=original_name,
            content_type=file.content_type,
            session_id=resolved_session_id,
        )
    except Exception:
        row.status = UploadedFileStatus.failed
        db.commit()
        raise

    db.commit()
    return ApiResponse(
        data=FileUploadResponse(file_id=row.id, status=row.status.value, original_name=row.original_name, size_bytes=row.size_bytes),
        request_id=request_id,
    )


@router.delete("/{file_id}", response_model=ApiResponse[FileDeleteResponse])
def delete_file(
    file_id: str,
    db: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[FileDeleteResponse]:
    row = db.get(UploadedFile, file_id)
    if not row or row.user_id != current_user.id or row.status == UploadedFileStatus.deleted:
        raise QueuelyError("file_not_found", "File not found.", status_code=404)

    storage_path = Path(row.storage_path)
    for chunk in list(row.chunks):
        db.delete(chunk)
    row.status = UploadedFileStatus.deleted
    db.commit()

    if storage_path.exists():
        storage_path.unlink()

    return ApiResponse(data=FileDeleteResponse(file_id=file_id, deleted=True), request_id=request_id)
