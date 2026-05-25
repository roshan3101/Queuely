from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import statistics

from pydantic import BaseModel, ConfigDict, Field, model_validator
import pdfplumber
import pypdfium2
from pypdf import PdfReader
import pytesseract

from queuely.core.config import get_settings
from queuely.job_processors.runtime import artifact_dir, atomic_write_json, emit_progress


settings = get_settings()


class PdfProcessingPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pages: list[str] | None = None
    text: str | None = None
    file_path: str | None = None
    page_break_marker: str = "\f"
    preview_chars: int = Field(default=500, ge=64, le=4000)
    enable_ocr: bool | None = None
    enable_table_extraction: bool | None = None

    @model_validator(mode="after")
    def validate_source(self) -> "PdfProcessingPayload":
        sources = [bool(self.pages), bool(self.text), bool(self.file_path)]
        if sum(sources) != 1:
            raise ValueError("Exactly one of pages, text, or file_path must be provided.")
        return self


@dataclass(frozen=True)
class PageExtraction:
    page_number: int
    text: str
    text_source: str
    tables: list[list[list[str | None]]]
    used_ocr: bool


def parse_pdf_payload(payload: dict) -> PdfProcessingPayload:
    return PdfProcessingPayload.model_validate(payload)


def _resolve_allowed_pdf_path(raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser().resolve(strict=True)
    allowed_roots = [(Path(root).expanduser().resolve()) for root in settings.pdf_allowed_roots]
    if not any(candidate == root or root in candidate.parents for root in allowed_roots):
        raise ValueError(f"PDF file path is outside allowed roots: {candidate}")
    if candidate.suffix.lower() != ".pdf":
        raise ValueError("file_path must point to a .pdf file.")
    if candidate.stat().st_size > settings.pdf_max_file_size_bytes:
        raise ValueError("PDF file exceeds the configured maximum size.")
    return candidate


def _configure_tesseract() -> str | None:
    if settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
    return shutil.which("tesseract") or settings.tesseract_cmd


def _extract_tables(pdf_path: Path) -> dict[int, list[list[list[str | None]]]]:
    if not settings.pdf_enable_table_extraction:
        return {}
    tables_by_page: dict[int, list[list[list[str | None]]]] = {}
    with pdfplumber.open(str(pdf_path)) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            page_tables = page.extract_tables() or []
            if page_tables:
                tables_by_page[index] = page_tables
    return tables_by_page


def _render_page_for_ocr(pdf_path: Path, page_number: int) -> str:
    tesseract_cmd = _configure_tesseract()
    if not tesseract_cmd:
        raise RuntimeError("Tesseract OCR is not installed. Install the tesseract binary or set TESSERACT_CMD.")

    document = pypdfium2.PdfDocument(str(pdf_path))
    page = document[page_number - 1]
    try:
        bitmap = page.render(scale=settings.pdf_ocr_dpi_scale)
        image = bitmap.to_pil()
        try:
            return pytesseract.image_to_string(image).strip()
        finally:
            image.close()
            bitmap.close()
    finally:
        page.close()
        document.close()


def _extract_pdf_pages_from_file(payload: PdfProcessingPayload) -> tuple[list[PageExtraction], dict[str, object]]:
    pdf_path = _resolve_allowed_pdf_path(str(payload.file_path))
    reader = PdfReader(str(pdf_path))
    if len(reader.pages) > settings.pdf_max_pages:
        raise ValueError(f"PDF exceeds the configured page limit of {settings.pdf_max_pages}.")

    tables_by_page = _extract_tables(pdf_path) if (payload.enable_table_extraction if payload.enable_table_extraction is not None else settings.pdf_enable_table_extraction) else {}
    use_ocr = payload.enable_ocr if payload.enable_ocr is not None else settings.pdf_enable_ocr
    pages: list[PageExtraction] = []

    for index, page in enumerate(reader.pages, start=1):
        native_text = (page.extract_text() or "").strip()
        tables = tables_by_page.get(index, [])
        scanned = len(native_text) < settings.pdf_scan_text_threshold
        used_ocr = False
        page_text = native_text
        text_source = "native"
        if scanned and use_ocr:
            page_text = _render_page_for_ocr(pdf_path, index)
            used_ocr = True
            text_source = "ocr"
        pages.append(
            PageExtraction(
                page_number=index,
                text=page_text,
                text_source=text_source,
                tables=tables,
                used_ocr=used_ocr,
            )
        )

    metadata = {
        "source": str(pdf_path),
        "file_name": pdf_path.name,
        "page_limit": settings.pdf_max_pages,
        "ocr_enabled": use_ocr,
        "table_extraction_enabled": bool(tables_by_page) or (payload.enable_table_extraction if payload.enable_table_extraction is not None else settings.pdf_enable_table_extraction),
    }
    return pages, metadata


def _extract_inline_pages(payload: PdfProcessingPayload) -> tuple[list[PageExtraction], dict[str, object]]:
    if payload.pages:
        pages = [PageExtraction(page_number=index, text=str(page), text_source="payload.pages", tables=[], used_ocr=False) for index, page in enumerate(payload.pages, start=1)]
        return pages, {"source": "payload.pages"}

    split_pages = [part.strip() for part in str(payload.text).split(payload.page_break_marker)]
    normalized = [page for page in split_pages if page] or [str(payload.text)]
    pages = [PageExtraction(page_number=index, text=page, text_source="payload.text", tables=[], used_ocr=False) for index, page in enumerate(normalized, start=1)]
    return pages, {"source": "payload.text"}


def extract_pdf_content(payload: PdfProcessingPayload) -> tuple[list[PageExtraction], dict[str, object]]:
    if payload.file_path:
        return _extract_pdf_pages_from_file(payload)
    return _extract_inline_pages(payload)


def execute_pdf_job(job_id: str, payload: dict) -> dict[str, object]:
    validated = parse_pdf_payload(payload)
    pages, source_metadata = extract_pdf_content(validated)
    page_count = len(pages)
    page_texts: list[str] = []
    word_counts: list[int] = []
    extracted_tables: list[dict[str, object]] = []
    ocr_pages: list[int] = []

    for page in pages:
        text = page.text.strip()
        page_texts.append(text)
        word_counts.append(len(text.split()))
        if page.used_ocr:
            ocr_pages.append(page.page_number)
        if page.tables:
            extracted_tables.append({"page_number": page.page_number, "tables": page.tables})
        emit_progress(
            job_id,
            step=page.page_number,
            steps_total=max(page_count, 1),
            message="Processed PDF page.",
            metadata={
                "page_number": page.page_number,
                "used_ocr": page.used_ocr,
                "table_count": len(page.tables),
                "text_source": page.text_source,
            },
        )

    combined_text = "\n\n".join(text for text in page_texts if text)
    result: dict[str, object] = {
        "job_id": job_id,
        "kind": "pdf_processing",
        "status": "ok",
        "page_count": page_count,
        "character_count": len(combined_text),
        "word_count": sum(word_counts),
        "average_words_per_page": round(statistics.mean(word_counts), 2) if word_counts else 0.0,
        "preview": combined_text[: validated.preview_chars],
        "ocr_pages": ocr_pages,
        "ocr_used": bool(ocr_pages),
        "table_page_count": len(extracted_tables),
        "tables": extracted_tables,
        **source_metadata,
    }
    output_path = artifact_dir("pdf") / f"{job_id}.json"
    atomic_write_json(output_path, result)
    result["artifact_path"] = str(output_path)
    return result
