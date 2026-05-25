FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

COPY pyproject.toml /app/pyproject.toml
COPY src /app/src

COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

CMD ["uvicorn", "queuely.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
