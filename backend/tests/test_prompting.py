from __future__ import annotations

from queuely.services.prompting import PromptPiece, clamp_prompt, estimate_tokens


def test_clamp_prompt_stays_within_budget() -> None:
    model = "gpt-4.1-mini"
    messages = clamp_prompt(
        model=model,
        system_prompt="You are concise.",
        retrieved_memory=[
            "User asked about queue workers and retries.",
            "Assistant explained the Celery retry path.",
        ],
        retrieved_chunks=[
            "def build_queue_name(job_type): return f'jobs.{job_type}'",
        ],
        recent_messages=[
            PromptPiece(role="user", content="Show me the retry flow."),
            PromptPiece(role="assistant", content="Here is the retry flow."),
            PromptPiece(role="user", content="Now summarize it in one paragraph."),
        ],
        max_input_tokens=120,
    )

    total_tokens = sum(estimate_tokens(model, item["content"]) + 4 for item in messages)
    assert total_tokens <= 120
    assert messages[0]["role"] == "system"

