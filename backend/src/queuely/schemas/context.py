from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class SessionRead(BaseModel):
    id: str
    title: str
    status: str
    model_name: str | None
    created_at: datetime
    updated_at: datetime


class SessionListRead(BaseModel):
    items: list[SessionRead]
    total: int
    limit: int
    offset: int


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1)


class MessageRead(BaseModel):
    id: str
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    sequence_number: int
    created_at: datetime
    referenced_files: list[str] = Field(default_factory=list)


class MessageListRead(BaseModel):
    items: list[MessageRead]
    total: int
    limit: int
    offset: int


class FileUploadResponse(BaseModel):
    file_id: str
    status: str
    original_name: str
    size_bytes: int


class FileRead(BaseModel):
    id: str
    session_id: str | None
    original_name: str
    language: str | None
    status: str
    size_bytes: int
    created_at: datetime
    updated_at: datetime


class FileListRead(BaseModel):
    items: list[FileRead]
    total: int
    limit: int
    offset: int
