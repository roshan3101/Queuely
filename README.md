# Queuely

Distributed task processing platform built with FastAPI, Celery, Redis, PostgreSQL, WebSockets, Docker, and React.

## Monorepo Layout

- `backend/`: FastAPI API, Celery worker code, database models, migrations, shared backend settings
- `frontend/`: React dashboard scaffold
- `infra/`: Docker Compose, container definitions, Redis/PostgreSQL bootstrapping
- `docs/`: Architecture and schema notes

## Current Status

This repository currently contains the initial production-oriented project structure and database schema.

## Delivery Tracking

- Architecture overview: `docs/architecture.md`
- Database schema notes: `docs/database-schema.md`
- Full build checklist: `docs/build-checklist.md`
