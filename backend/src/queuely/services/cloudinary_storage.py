from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import cloudinary
import cloudinary.uploader
import requests

from queuely.core.config import get_settings


settings = get_settings()


@dataclass(frozen=True)
class CloudinaryAsset:
    public_id: str
    secure_url: str
    resource_type: str
    bytes: int | None = None
    format: str | None = None


def is_configured() -> bool:
    return bool(settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret)


def configure_cloudinary() -> None:
    if not is_configured():
        return
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def upload_bytes(
    data: bytes,
    *,
    filename: str,
    folder: str,
    resource_type: str = "raw",
    public_id: str | None = None,
    content_type: str | None = None,
) -> CloudinaryAsset | None:
    if not is_configured():
        return None

    configure_cloudinary()
    if public_id is None:
        public_id = Path(filename).stem
    upload_kwargs: dict[str, Any] = {
        "folder": folder,
        "resource_type": resource_type,
        "public_id": public_id,
        "use_filename": True,
        "unique_filename": True,
        "overwrite": True,
    }
    if content_type:
        upload_kwargs["content_type"] = content_type

    result = cloudinary.uploader.upload(BytesIO(data), **upload_kwargs)
    return CloudinaryAsset(
        public_id=str(result["public_id"]),
        secure_url=str(result["secure_url"]),
        resource_type=resource_type,
        bytes=int(result.get("bytes") or len(data)),
        format=str(result.get("format")) if result.get("format") else None,
    )


def download_url(url: str, *, timeout: int = 60) -> bytes:
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.content


def destroy_asset(public_id: str, *, resource_type: str = "raw") -> None:
    if not is_configured():
        return

    configure_cloudinary()
    cloudinary.uploader.destroy(public_id, resource_type=resource_type, invalidate=True)