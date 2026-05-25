COMPOSE_FILE=infra/docker-compose.yml

.PHONY: dev down logs migrate test lint frontend-build

dev:
	docker compose -f $(COMPOSE_FILE) up --build

down:
	docker compose -f $(COMPOSE_FILE) down

logs:
	docker compose -f $(COMPOSE_FILE) logs -f

migrate:
	cd backend && alembic upgrade head

test:
	cd backend && pytest

lint:
	cd backend && ruff check src
	cd frontend && npm run lint

frontend-build:
	cd frontend && npm run build
