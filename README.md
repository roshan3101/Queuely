# Queuely

Distributed task processing platform built with FastAPI, Celery, Redis, PostgreSQL, WebSockets, Docker, and React.

## Monorepo Layout

- `backend/`: FastAPI API, Celery worker code, database models, migrations, shared backend settings
- `frontend/`: React dashboard scaffold
- `infra/`: Docker Compose, container definitions, Redis/PostgreSQL bootstrapping
- `docs/`: Architecture and schema notes

## Current Status

This repository contains a working local stack (API + worker + Redis + Postgres + Next.js dashboard), job processing with retries/DLQ, WebSocket fanout for job events, and an AI debug-session surface with memory + codebase context (pgvector).

## Local Dev (Docker)

Run the full stack:

```powershell
docker compose -f infra/docker-compose.yml up --build
```

Open:
- API: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000`

Migrations:
- Docker will run migrations automatically via the `api-migrate` service on startup.

## Tests

Run unit tests (local venv):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

Run docker integration tests:

```powershell
make test-docker
```

## Delivery Tracking

- Architecture overview: `docs/architecture.md`
- Database schema notes: `docs/database-schema.md`
- Full build checklist: `docs/build-checklist.md`
