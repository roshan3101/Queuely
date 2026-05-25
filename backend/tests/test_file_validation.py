from __future__ import annotations

import pytest

from queuely.api.routes.files import _validate_upload
from queuely.core.exceptions import QueuelyError


def test_validate_upload_accepts_supported_code_file() -> None:
    _validate_upload("example.py", 1024)


def test_validate_upload_rejects_unsupported_extension() -> None:
    with pytest.raises(QueuelyError):
        _validate_upload("archive.zip", 1024)


def test_validate_upload_rejects_oversized_file() -> None:
    with pytest.raises(QueuelyError):
        _validate_upload("example.py", 10 * 1024 * 1024)

