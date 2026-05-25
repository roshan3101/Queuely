# Queuely Frontend (Next.js Dashboard)

This is the Queuely dashboard UI. It’s a Next.js app that talks to the FastAPI backend to:

- submit and monitor jobs
- receive live job events over WebSockets (backend fanout)
- manage AI debug sessions (chat + streaming)
- upload files for codebase-context retrieval (RAG)

For the full system overview, start at the repo root: `README.md` and `docs/PROJECT_GUIDE.md`.

## Run (Recommended)

Run the full stack (API + worker + Redis + Postgres + frontend) from the repo root:

```powershell
docker compose -f infra/docker-compose.yml up --build
```

Open `http://localhost:3000`.

## Run Frontend Only (Local)

From `frontend/`:

```powershell
npm install
npm run dev
```

This requires the API to be running separately.

### Environment Variables

The frontend uses:

- `NEXT_PUBLIC_API_BASE_URL` (example: `http://localhost:8000`)

When using Docker Compose, this is provided via the repo’s `.env.example` (see `infra/docker-compose.yml`).

## Scripts

- `npm run dev` - local dev server
- `npm run lint` - ESLint
- `npm run test` - unit tests (Vitest)
- `npm run test:e2e` - e2e tests (Playwright)
- `npm run build` / `npm run start` - production build + server

## Testing

Unit tests:

```powershell
npm run test
```

End-to-end tests (expects the app to be running):

```powershell
npm run test:e2e
```
