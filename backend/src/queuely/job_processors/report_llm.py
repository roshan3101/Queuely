from __future__ import annotations

import json
from typing import Literal

from google import genai
from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from queuely.core.config import get_settings
from queuely.core.exceptions import QueuelyError


settings = get_settings()
ReportProvider = Literal["template", "openai", "gemini"]


class StructuredSection(BaseModel):
    model_config = ConfigDict(extra="ignore")

    heading: str = Field(min_length=1, max_length=255)
    body: str = Field(default="")


class StructuredReport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=255)
    summary: str | None = None
    sections: list[StructuredSection] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)


def _openai_client() -> OpenAI:
    if not settings.openai_api_key:
        raise QueuelyError("missing_openai_key", "OPENAI_API_KEY is not configured.", status_code=500)
    return OpenAI(api_key=settings.openai_api_key)


def _gemini_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise QueuelyError("missing_gemini_key", "GEMINI_API_KEY is not configured.", status_code=500)
    return genai.Client(api_key=settings.gemini_api_key)


def _report_prompt(*, title: str, sections: list[dict[str, str]], summary: str | None, metadata: dict[str, object]) -> str:
    return (
        "You are generating a structured backend report. "
        "Return strict JSON with keys: title, summary, sections, metadata. "
        "Each section must contain heading and body. "
        "Do not wrap the JSON in markdown.\n\n"
        f"Title: {title}\n"
        f"Existing summary: {summary or ''}\n"
        f"Metadata: {json.dumps(metadata, sort_keys=True)}\n"
        f"Sections: {json.dumps(sections, ensure_ascii=True)}\n"
    )


def _extract_json(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("Provider response did not contain a JSON object.")
    return text[start : end + 1]


def _generate_openai(*, model: str, prompt: str) -> str:
    response = _openai_client().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    return response.choices[0].message.content or ""


def _generate_gemini(*, model: str, prompt: str) -> str:
    response = _gemini_client().models.generate_content(
        model=model,
        contents=prompt,
    )
    return response.text or ""


def generate_structured_report(
    *,
    provider: ReportProvider,
    model: str | None,
    title: str,
    sections: list[dict[str, str]],
    summary: str | None,
    metadata: dict[str, object],
) -> StructuredReport:
    prompt = _report_prompt(title=title, sections=sections, summary=summary, metadata=metadata)
    if provider == "openai":
        raw = _generate_openai(model=model or settings.openai_model, prompt=prompt)
    elif provider == "gemini":
        raw = _generate_gemini(model=model or settings.gemini_model, prompt=prompt)
    else:
        raise ValueError(f"Unsupported provider: {provider}")
    payload = json.loads(_extract_json(raw))
    return StructuredReport.model_validate(payload)
