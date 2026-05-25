from __future__ import annotations

from email.message import EmailMessage
from email.utils import formatdate, make_msgid
import smtplib
import ssl
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from queuely.core.config import get_settings
from queuely.job_processors.runtime import artifact_dir, atomic_write_text, emit_progress


settings = get_settings()


class EmailSendingPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    to: list[EmailStr] | EmailStr
    subject: str = Field(min_length=1, max_length=998)
    body: str = ""
    html: str | None = None
    from_email: EmailStr | None = None
    cc: list[EmailStr] = Field(default_factory=list)
    bcc: list[EmailStr] = Field(default_factory=list)
    reply_to: list[EmailStr] = Field(default_factory=list)
    headers: dict[str, str] = Field(default_factory=dict)
    dry_run: bool | None = None

    @model_validator(mode="after")
    def validate_body(self) -> "EmailSendingPayload":
        if not self.body and not self.html:
            raise ValueError("At least one of body or html must be provided.")
        return self


def parse_email_payload(payload: dict, job_id: str) -> EmailSendingPayload:
    normalized = dict(payload)
    if not normalized.get("subject"):
        normalized["subject"] = f"Queuely job {job_id[:8]}"
    return EmailSendingPayload.model_validate(normalized)


def _normalize_recipients(value: list[EmailStr] | EmailStr) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def build_email_message(payload: EmailSendingPayload, job_id: str) -> EmailMessage:
    message = EmailMessage()
    message["Message-Id"] = make_msgid(idstring=job_id[:8], domain="queuely.local")
    message["Date"] = formatdate(localtime=False)
    message["To"] = ", ".join(_normalize_recipients(payload.to))
    message["From"] = str(payload.from_email or settings.smtp_from_email or "noreply@queuely.local")
    message["Subject"] = payload.subject
    if payload.cc:
        message["Cc"] = ", ".join(str(item) for item in payload.cc)
    if payload.reply_to:
        message["Reply-To"] = ", ".join(str(item) for item in payload.reply_to)
    for header_name, header_value in payload.headers.items():
        message[header_name] = header_value

    text_body = payload.body or "HTML-only message."
    message.set_content(text_body)
    if payload.html:
        message.add_alternative(payload.html, subtype="html")
    return message


def _delivery_mode(payload: EmailSendingPayload) -> str:
    if payload.dry_run is True:
        return "dry_run"
    if payload.dry_run is False:
        return "smtp"
    return "dry_run" if not settings.smtp_host else "smtp"


def deliver_via_smtp(message: EmailMessage, payload: EmailSendingPayload) -> dict[str, Any]:
    if not settings.smtp_host:
        raise ValueError("SMTP_HOST must be configured for SMTP delivery.")

    recipients = _normalize_recipients(payload.to) + [str(item) for item in payload.cc] + [str(item) for item in payload.bcc]
    context = ssl.create_default_context()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.ehlo()
        if settings.smtp_use_tls:
            smtp.starttls(context=context)
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message, to_addrs=recipients)

    return {
        "delivery_mode": "smtp",
        "smtp_host": settings.smtp_host,
        "recipient_count": len(recipients),
    }


def persist_dry_run_message(message: EmailMessage, job_id: str) -> dict[str, Any]:
    output_path = artifact_dir("emails") / f"{job_id}.eml"
    atomic_write_text(output_path, message.as_string())
    return {
        "delivery_mode": "dry_run",
        "artifact_path": str(output_path),
    }


def execute_email_job(job_id: str, payload: dict) -> dict[str, object]:
    emit_progress(job_id, step=1, steps_total=3, message="Validating email payload.")
    validated = parse_email_payload(payload, job_id)
    emit_progress(job_id, step=2, steps_total=3, message="Building email message.")
    message = build_email_message(validated, job_id)
    mode = _delivery_mode(validated)
    if mode == "smtp":
        delivery_result = deliver_via_smtp(message, validated)
    else:
        delivery_result = persist_dry_run_message(message, job_id)
    emit_progress(job_id, step=3, steps_total=3, message="Email delivery finished.")
    return {
        "job_id": job_id,
        "kind": "email_sending",
        "status": "ok",
        "to": _normalize_recipients(validated.to),
        **delivery_result,
    }
