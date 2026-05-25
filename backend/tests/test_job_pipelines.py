from __future__ import annotations

from pathlib import Path
import shutil

from queuely.tasks import jobs


def test_extract_pdf_payload_from_text() -> None:
    pages, meta = jobs._extract_pdf_payload({"text": "page one\fpage two"})
    assert pages == ["page one", "page two"]
    assert meta["source"] == "payload.text"


def _workspace_tmp(name: str) -> Path:
    path = Path("backend") / ".tmp_test_artifacts" / name
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_generate_report_document_writes_markdown(monkeypatch) -> None:
    tmp_path = _workspace_tmp("report")
    monkeypatch.setattr(jobs, "_artifact_dir", lambda _kind: tmp_path)
    result = jobs._generate_report_document(
        {
            "title": "Weekly",
            "format": "md",
            "sections": [{"heading": "Summary", "body": "All systems nominal"}],
        },
        "job-1234",
    )
    output = tmp_path / "job-1234.md"
    assert output.exists()
    assert result["format"] == "md"
    assert result["section_count"] == 1


def test_deliver_email_dry_run_writes_eml(monkeypatch) -> None:
    tmp_path = _workspace_tmp("email")
    monkeypatch.setattr(jobs, "_artifact_dir", lambda _kind: tmp_path)
    result = jobs._deliver_email({"to": "test@example.com", "subject": "Hello", "body": "World"}, "job-5678")
    output = tmp_path / "job-5678.eml"
    assert output.exists()
    assert result["delivery_mode"] == "dry_run"
    assert result["to"] == "test@example.com"
