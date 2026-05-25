from __future__ import annotations

from email.message import EmailMessage
import json
from pathlib import Path
import smtplib
import statistics
import time

from celery.utils.log import get_task_logger
from pypdf import PdfReader

from queuely.core.config import get_settings
from queuely.db.job_store import add_event, get_job
from queuely.db.session import SessionLocal
from queuely.models.job import JobStatus
from queuely.tasks.base import BaseJobTask
from queuely.tasks.celery_app import celery_app
from queuely.tasks.dlq import dead_letter as dead_letter_task


logger = get_task_logger(__name__)
settings = get_settings()


def _artifact_dir(kind: str) -> Path:
    root = Path("backend") / "storage" / kind
    root.mkdir(parents=True, exist_ok=True)
    return root


def _load_job_payload(job_id: str) -> dict:
    with SessionLocal() as session:
        job = get_job(session, job_id)
        if not job or not isinstance(job.payload, dict):
            return {}
        return dict(job.payload)


def _emit_progress(
    job_id: str,
    *,
    step: int,
    steps_total: int,
    message: str,
    metadata: dict | None = None,
) -> None:
    with SessionLocal() as session:
        job = get_job(session, job_id)
        if job and job.status == JobStatus.running:
            payload = {"progress": step / max(steps_total, 1), "step": step, "steps_total": steps_total}
            if metadata:
                payload.update(metadata)
            add_event(
                session,
                job_id=job_id,
                event_type="job_progress",
                status=JobStatus.running,
                message=message,
                metadata=payload,
            )
            session.commit()


def _write_json_artifact(kind: str, job_id: str, payload: dict) -> str:
    output_path = _artifact_dir(kind) / f"{job_id}.json"
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return str(output_path)


def _extract_pdf_payload(payload: dict) -> tuple[list[str], dict]:
    if isinstance(payload.get("pages"), list):
        pages = [str(page) for page in payload["pages"]]
        return pages, {"source": "payload.pages"}

    if isinstance(payload.get("text"), str):
        marker = str(payload.get("page_break_marker") or "\f")
        pages = [part.strip() for part in payload["text"].split(marker)]
        pages = [page for page in pages if page]
        return pages or [payload["text"]], {"source": "payload.text"}

    file_path = payload.get("file_path")
    if not file_path:
        raise ValueError("PDF payload requires one of: pages, text, or file_path")

    pdf_path = Path(str(file_path))
    if not pdf_path.exists() or not pdf_path.is_file():
        raise ValueError(f"PDF file does not exist: {pdf_path}")

    reader = PdfReader(str(pdf_path))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return pages, {"source": str(pdf_path), "file_name": pdf_path.name}


def _generate_report_document(payload: dict, job_id: str) -> dict[str, object]:
    title = str(payload.get("title") or f"Report {job_id[:8]}")
    sections = payload.get("sections") or []
    report_format = str(payload.get("format") or "json").lower()
    if report_format not in {"json", "md", "txt"}:
        raise ValueError("Report format must be one of: json, md, txt")

    normalized_sections: list[dict[str, str]] = []
    for index, section in enumerate(sections, start=1):
        if isinstance(section, dict):
            heading = str(section.get("heading") or f"Section {index}")
            body = str(section.get("body") or "")
        else:
            heading = f"Section {index}"
            body = str(section)
        normalized_sections.append({"heading": heading, "body": body})

    stats = {
        "section_count": len(normalized_sections),
        "word_count": sum(len(section["body"].split()) for section in normalized_sections),
    }

    output_dir = _artifact_dir("reports")
    extension = "json" if report_format == "json" else report_format
    output_path = output_dir / f"{job_id}.{extension}"

    if report_format == "json":
        body = {"title": title, "sections": normalized_sections, "stats": stats}
        output_path.write_text(json.dumps(body, indent=2), encoding="utf-8")
    elif report_format == "md":
        content = [f"# {title}", ""]
        for section in normalized_sections:
            content.extend([f"## {section['heading']}", section["body"], ""])
        output_path.write_text("\n".join(content).strip() + "\n", encoding="utf-8")
    else:
        content = [title, "=" * len(title), ""]
        for section in normalized_sections:
            content.extend([section["heading"], section["body"], ""])
        output_path.write_text("\n".join(content).strip() + "\n", encoding="utf-8")

    return {"title": title, "format": report_format, "path": str(output_path), **stats}


def _deliver_email(payload: dict, job_id: str) -> dict[str, object]:
    to_email = payload.get("to")
    if not to_email:
        raise ValueError("Missing required payload field: to")

    subject = str(payload.get("subject") or f"Queuely job {job_id[:8]}")
    body = str(payload.get("body") or payload.get("text") or "")
    html_body = payload.get("html")
    dry_run = bool(payload.get("dry_run", not settings.smtp_host))

    message = EmailMessage()
    message["To"] = str(to_email)
    message["From"] = payload.get("from_email") or settings.smtp_from_email or "noreply@queuely.local"
    message["Subject"] = subject
    message.set_content(body)
    if html_body:
        message.add_alternative(str(html_body), subtype="html")

    if dry_run:
        output_path = _artifact_dir("emails") / f"{job_id}.eml"
        output_path.write_text(message.as_string(), encoding="utf-8")
        return {"to": str(to_email), "delivery_mode": "dry_run", "artifact_path": str(output_path)}

    if not settings.smtp_host:
        raise ValueError("SMTP_HOST must be configured for non-dry-run email delivery")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)

    return {"to": str(to_email), "delivery_mode": "smtp", "smtp_host": settings.smtp_host}


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.process_pdf")
def process_pdf(self: BaseJobTask, job_id: str) -> dict[str, object]:
    try:
        payload = _load_job_payload(job_id)
        pages, source_meta = _extract_pdf_payload(payload)
        page_count = len(pages)
        cleaned_pages: list[str] = []
        word_counts: list[int] = []
        for index, page in enumerate(pages, start=1):
            text = page.strip()
            cleaned_pages.append(text)
            word_counts.append(len(text.split()))
            _emit_progress(
                job_id,
                step=index,
                steps_total=max(page_count, 1),
                message="Processed PDF page.",
                metadata={"page_number": index},
            )
            time.sleep(0.05)

        combined_text = "\n\n".join(page for page in cleaned_pages if page)
        summary = {
            "job_id": job_id,
            "kind": "pdf_processing",
            "status": "ok",
            "page_count": page_count,
            "character_count": len(combined_text),
            "word_count": sum(word_counts),
            "average_words_per_page": round(statistics.mean(word_counts), 2) if word_counts else 0.0,
            "preview": combined_text[:500],
            **source_meta,
        }
        summary["artifact_path"] = _write_json_artifact("pdf", job_id, summary)
        return summary
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.generate_report")
def generate_report(self: BaseJobTask, job_id: str) -> dict[str, object]:
    try:
        payload = _load_job_payload(job_id)
        _emit_progress(job_id, step=1, steps_total=2, message="Building report sections.")
        result = _generate_report_document(payload, job_id)
        _emit_progress(job_id, step=2, steps_total=2, message="Report artifact written.")
        return {"job_id": job_id, "kind": "report_generation", "status": "ok", **result}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.send_email")
def send_email(self: BaseJobTask, job_id: str) -> dict[str, object]:
    try:
        payload = _load_job_payload(job_id)
        _emit_progress(job_id, step=1, steps_total=2, message="Preparing email message.")
        result = _deliver_email(payload, job_id)
        _emit_progress(job_id, step=2, steps_total=2, message="Email delivery finished.")
        return {"job_id": job_id, "kind": "email_sending", "status": "ok", **result}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise


@celery_app.task(bind=True, base=BaseJobTask, name="queuely.tasks.jobs.process_custom")
def process_custom(self: BaseJobTask, job_id: str) -> dict[str, str]:
    try:
        with SessionLocal() as session:
            job = get_job(session, job_id)
            if job and isinstance(job.payload, dict) and job.payload.get("raise") is True:
                raise RuntimeError("Intentional failure for DLQ smoke test.")
        logger.info("Custom task for job %s", job_id)
        time.sleep(0.25)
        return {"job_id": job_id, "kind": "custom", "status": "ok"}
    except Exception as exc:
        dead_letter_task.delay(job_id, str(exc))
        self.handle_failure(exc, job_id=job_id)
        raise
