from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from queuely.job_processors.report_llm import StructuredReport, generate_structured_report
from queuely.job_processors.runtime import artifact_dir, atomic_write_json, atomic_write_text, emit_progress


class ReportSectionInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    heading: str = Field(min_length=1, max_length=255)
    body: str = Field(default="")


class ReportGenerationPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(default="Untitled report", min_length=1, max_length=255)
    format: str = Field(default="json", pattern="^(json|md|txt)$")
    provider: Literal["template", "openai", "gemini"] = "template"
    provider_model: str | None = None
    sections: list[ReportSectionInput] = Field(default_factory=list)
    summary: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


@dataclass(frozen=True)
class ReportStats:
    section_count: int
    word_count: int
    character_count: int


def parse_report_payload(payload: dict, job_id: str) -> ReportGenerationPayload:
    normalized = dict(payload)
    if not normalized.get("title"):
        normalized["title"] = f"Report {job_id[:8]}"
    sections = normalized.get("sections") or []
    normalized["sections"] = [
        section if isinstance(section, dict) else {"heading": f"Section {index}", "body": str(section)}
        for index, section in enumerate(sections, start=1)
    ]
    return ReportGenerationPayload.model_validate(normalized)


def _structured_from_template(payload: ReportGenerationPayload) -> StructuredReport:
    return StructuredReport(
        title=payload.title,
        summary=payload.summary,
        sections=[{"heading": section.heading, "body": section.body} for section in payload.sections],
        metadata=payload.metadata,
    )


def build_structured_report(payload: ReportGenerationPayload) -> StructuredReport:
    if payload.provider == "template":
        return _structured_from_template(payload)
    return generate_structured_report(
        provider=payload.provider,
        model=payload.provider_model,
        title=payload.title,
        sections=[{"heading": section.heading, "body": section.body} for section in payload.sections],
        summary=payload.summary,
        metadata=payload.metadata,
    )


def build_report_stats(report: StructuredReport) -> ReportStats:
    section_bodies = [section.body for section in report.sections]
    return ReportStats(
        section_count=len(report.sections),
        word_count=sum(len(body.split()) for body in section_bodies),
        character_count=sum(len(body) for body in section_bodies),
    )


def render_report_document(payload: ReportGenerationPayload, report: StructuredReport, stats: ReportStats) -> str:
    if payload.format == "json":
        document = {
            "title": report.title,
            "summary": report.summary,
            "sections": [section.model_dump() for section in report.sections],
            "stats": asdict(stats),
            "metadata": report.metadata,
            "provider": payload.provider,
            "provider_model": payload.provider_model,
        }
        return json.dumps(document, indent=2, sort_keys=True)

    if payload.format == "md":
        lines = [f"# {report.title}", ""]
        if report.summary:
            lines.extend([report.summary, ""])
        for section in report.sections:
            lines.extend([f"## {section.heading}", section.body, ""])
        return "\n".join(lines).strip() + "\n"

    lines = [report.title, "=" * len(report.title), ""]
    if report.summary:
        lines.extend([report.summary, ""])
    for section in report.sections:
        lines.extend([section.heading, section.body, ""])
    return "\n".join(lines).strip() + "\n"


def execute_report_job(job_id: str, payload: dict) -> dict[str, object]:
    emit_progress(job_id, step=1, steps_total=4, message="Validating report payload.")
    validated = parse_report_payload(payload, job_id)
    emit_progress(job_id, step=2, steps_total=4, message="Generating structured report content.")
    structured = build_structured_report(validated)
    stats = build_report_stats(structured)
    emit_progress(job_id, step=3, steps_total=4, message="Rendering report document.")
    document = render_report_document(validated, structured, stats)
    extension = "json" if validated.format == "json" else validated.format
    output_path = artifact_dir("reports") / f"{job_id}.{extension}"
    if validated.format == "json":
        atomic_write_json(output_path, json.loads(document))
    else:
        atomic_write_text(output_path, document)
    emit_progress(job_id, step=4, steps_total=4, message="Report artifact written.")
    return {
        "job_id": job_id,
        "kind": "report_generation",
        "status": "ok",
        "title": structured.title,
        "format": validated.format,
        "provider": validated.provider,
        "provider_model": validated.provider_model,
        "path": str(output_path),
        **asdict(stats),
    }
