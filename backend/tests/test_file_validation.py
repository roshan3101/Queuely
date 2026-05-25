from __future__ import annotations

import pytest

from queuely.api.routes.files import _validate_upload
from queuely.core.exceptions import QueuelyError


def test_validate_upload_accepts_supported_code_file() -> None:
    _validate_upload("example.py", b"print('hello')\n")


def test_validate_upload_rejects_unsupported_extension() -> None:
    with pytest.raises(QueuelyError):
        _validate_upload("archive.zip", b"PK\x03\x04")


def test_validate_upload_rejects_oversized_file() -> None:
    with pytest.raises(QueuelyError):
        _validate_upload("example.py", b"a" * (10 * 1024 * 1024))


def test_validate_upload_rejects_binary_magic() -> None:
    with pytest.raises(QueuelyError):
        _validate_upload("example.py", b"MZ\x90\x00binary")


def test_validate_upload_rejects_null_bytes() -> None:
    with pytest.raises(QueuelyError):
        _validate_upload("example.py", b"print('x')\x00")
