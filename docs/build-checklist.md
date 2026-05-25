# Queuely Build Checklist

This document is the execution checklist for the full platform.

## Working Rule

- Package installation is done only through the terminal.
- Database migrations are created and run only through the terminal.
- If a step requires either of those, it must be executed explicitly or handed off to you.

## Phase 0: Foundation

- [x] Create monorepo structure for backend, frontend, infra, and docs
- [x] Add backend package scaffold for FastAPI, Celery, SQLAlchemy, Alembic, and WebSockets
- [x] Add frontend scaffold for React dashboard
- [x] Add Docker Compose skeleton for API, worker, Redis, PostgreSQL, and frontend
- [x] Define initial PostgreSQL schema for users, jobs, job events, refresh tokens, worker heartbeats, and rate-limit buckets
- [x] Install backend Python dependencies in terminal
- [x] Install frontend Node dependencies in terminal
- [x] Create and run initial Alembic migration in a real database environment
- [ ] Enable PostgreSQL extensions required by the platform:
  - [x] `pgvector`
  - [ ] `uuid-ossp` if we decide to use DB-generated UUIDs later

## Phase 1: Backend Core

- [x] Establish FastAPI app lifecycle, settings loading, dependency injection, and error handling
- [x] Add structured logging and request correlation ids
- [x] Add environment-specific config strategy for local, staging, and production
- [x] Add database session management and health checks
- [x] Add Redis connection management and broker health checks
- [x] Add shared response envelope and API error model

## Phase 2: Authentication and Users

- [x] Build user registration flow
- [x] Build login flow with JWT access tokens
- [x] Build refresh token rotation and revocation
- [x] Persist refresh-token sessions in PostgreSQL
- [x] Add current-user endpoint
- [x] Add logout endpoint
- [x] Add auth guards for protected routes
- [x] Add password hashing and verification
- [x] Add role model for admin/operator visibility

## Phase 3: Job Domain Model

- [x] Finalize supported job types and payload contracts
- [x] Create Pydantic request and response schemas for jobs
- [x] Define idempotency behavior for repeated submissions
- [x] Define job priority behavior
- [x] Define cancellation semantics
- [x] Define result payload normalization across job types
- [x] Define operator-facing event taxonomy for `job_events`

## Phase 4: Job Submission API

- [x] Build `POST /jobs` endpoint
- [x] Validate authenticated user and payload
- [ ] Enforce per-user rate limit before enqueueing
- [x] Persist job row before dispatch
- [x] Publish task to the correct Celery queue
- [x] Return stable job id and initial status
- [x] Build `GET /jobs/{job_id}` endpoint
- [x] Build `GET /jobs` listing endpoint with filtering and pagination
- [x] Build `POST /jobs/{job_id}/cancel` endpoint
- [x] Build idempotent submission handling using `idempotency_key`

## Phase 5: Queueing and Worker Execution

- [ ] Configure Celery queues for:
  - [ ] `jobs.default`
  - [ ] `jobs.pdf`
  - [ ] `jobs.report`
  - [ ] `jobs.email`
  - [ ] `jobs.dlq`
- [ ] Implement worker startup config and queue routing
- [ ] Implement base task class with shared job lookup and state updates
- [ ] Implement job state transitions from `pending` to terminal states
- [ ] Implement worker heartbeat updates in PostgreSQL
- [ ] Implement placeholder execution pipelines for:
  - [ ] PDF processing
  - [ ] Report generation
  - [ ] Email sending
- [ ] Persist task results to PostgreSQL
- [ ] Persist task failure details to PostgreSQL

## Phase 6: Retries and Dead Letter Queue

- [ ] Implement retry policy per job type
- [ ] Add exponential backoff calculation
- [ ] Persist retry counts and retry events
- [ ] Route exhausted jobs to `jobs.dlq`
- [ ] Mark dead-lettered jobs in PostgreSQL
- [ ] Expose dead-lettered jobs in operator APIs
- [ ] Add replay/requeue capability for dead-lettered jobs

## Phase 7: Real-Time Status Transport

- [ ] Build WebSocket authentication flow
- [ ] Build session manager for active WebSocket clients
- [ ] Publish job state changes to subscribers
- [ ] Bridge worker state updates into WebSocket broadcasts
- [ ] Support streaming updates for job progress and final results
- [ ] Add heartbeat/ping handling for WebSocket clients
- [ ] Add reconnect-safe client semantics

## Phase 8: Rate Limiting

- [ ] Implement token bucket algorithm against `rate_limit_buckets`
- [ ] Refill tokens based on elapsed time
- [ ] Enforce atomic bucket updates
- [ ] Add per-route rate-limit configuration
- [ ] Return standard rate-limit headers
- [ ] Return clear over-limit errors
- [ ] Add admin/operator visibility into rate-limit state if needed

## Phase 9: Memory Management System

- [ ] Extend PostgreSQL with `pgvector`
- [ ] Create memory tables for conversations and messages
- [ ] Create vector column for message embeddings
- [ ] Store every message in PostgreSQL
- [ ] Generate embedding for every stored message
- [ ] Store message role, session id, timestamps, and metadata
- [ ] On each new message, retrieve top 5 semantically similar past exchanges
- [ ] Define similarity search query and score thresholds
- [ ] Add recency-aware ranking so stale matches do not dominate
- [ ] Inject retrieved memory context into the system prompt builder
- [ ] Prevent duplicate or low-value retrievals
- [ ] Add retention and pruning rules for long-lived sessions

## Phase 10: Context Window Management

- [ ] Define token budget allocation for:
  - [ ] system prompt
  - [ ] memory retrieval
  - [ ] codebase context
  - [ ] conversation history
  - [ ] model response headroom
- [ ] Implement token counting service
- [ ] Implement prompt assembly pipeline
- [ ] Truncate low-priority context when near token limit
- [ ] Prefer summaries over raw history when needed
- [ ] Add safeguards so prompt construction never exceeds model limits
- [ ] Log context composition for debugging

## Phase 11: Codebase Context / File RAG

- [ ] Build file upload API for source files
- [ ] Validate file types, size limits, and malware-safe handling
- [ ] Store uploaded file metadata in PostgreSQL
- [ ] Persist original files in controlled storage
- [ ] Chunk uploaded files by language-aware strategy
- [ ] Generate embeddings for chunks using `text-embedding-ada-002` as requested
- [ ] Store chunk vectors in `pgvector`
- [ ] Retrieve relevant chunks for each query
- [ ] Inject retrieved chunks into prompt context
- [ ] Track which files and chunk ids were used in each response
- [ ] Return referenced files in API responses for frontend display
- [ ] Add re-index flow when a file is replaced
- [ ] Add deletion flow for uploaded files and derived chunks

## Phase 12: AI Conversation Orchestration

- [ ] Define debug session domain model
- [ ] Define conversation turn domain model
- [ ] Build message submission endpoint for AI sessions
- [ ] Build streaming response endpoint
- [ ] Build prompt composer that merges:
  - [ ] system instructions
  - [ ] recent chat history
  - [ ] retrieved memory
  - [ ] retrieved code chunks
- [ ] Persist assistant responses incrementally or on completion
- [ ] Persist retrieval provenance per response
- [ ] Support cancellation of in-flight AI generation

## Phase 13: Frontend Session Experience

- [ ] Build app shell with clean minimal dark theme
- [ ] Build sidebar showing all debug sessions
- [ ] Build session creation and selection flow
- [ ] Build conversation history view per session
- [ ] Build syntax-highlighted code blocks in messages
- [ ] Build file upload component for codebase context
- [ ] Build message composer
- [ ] Build real-time streaming of AI responses
- [ ] Build referenced-files panel for each response
- [ ] Build loading, retry, and disconnected states
- [ ] Build responsive layout for laptop and desktop

## Phase 14: Frontend Operations Dashboard

- [ ] Build queue overview widgets
- [ ] Build worker health panel
- [ ] Build job list with filters
- [ ] Build job detail drawer/page
- [ ] Build dead-letter queue visibility
- [ ] Build live status updates over WebSockets
- [ ] Build manual retry/requeue controls for operators

## Phase 15: Database Additions Still Needed

- [x] Add tables for:
  - [x] debug sessions
  - [x] conversation messages
  - [x] message embeddings or vectorized messages
  - [x] uploaded files
  - [x] file chunks
  - [x] response provenance / referenced files
- [x] Add indexes for semantic retrieval and session history access
- [x] Add foreign keys and cascade rules for session cleanup
- [x] Add Alembic migration for `pgvector` extension and vector columns

## Phase 16: Docker and Local Dev

- [ ] Add Dockerfile or compose config for frontend build/runtime split
- [ ] Add API container startup migration step or explicit migration workflow
- [ ] Add worker container health checks
- [ ] Add PostgreSQL init for required extensions
- [ ] Add Redis persistence and local inspection strategy
- [ ] Add makefile or task runner for local developer workflows

## Phase 17: Testing

- [ ] Add unit tests for auth, rate limiting, job lifecycle, and prompt assembly
- [ ] Add integration tests for API plus PostgreSQL plus Redis
- [ ] Add worker integration tests for retries and DLQ behavior
- [ ] Add WebSocket tests for live status updates
- [ ] Add retrieval tests for message memory and code chunks
- [ ] Add frontend component tests for sessions, streaming, and uploads
- [ ] Add end-to-end tests for the core session flow

## Phase 18: Security and Production Hardening

- [ ] Validate uploaded file content and extension handling
- [ ] Add request size limits
- [ ] Add CORS and trusted host config
- [ ] Add secret management strategy
- [ ] Add audit logging for privileged actions
- [ ] Add abuse controls for AI and upload endpoints
- [ ] Add worker isolation guidance for untrusted workloads

## Phase 19: Observability

- [ ] Add metrics for queue depth, task latency, retry counts, DLQ counts, and worker health
- [ ] Add tracing or request correlation across API and workers
- [ ] Add prompt assembly diagnostics
- [ ] Add retrieval diagnostics for memory and code context
- [ ] Add dashboard/admin surfaces for operational debugging

## Phase 20: Documentation and Runbooks

- [ ] Document local development workflow
- [ ] Document migration workflow
- [ ] Document package installation workflow
- [ ] Document job lifecycle and queue routing
- [ ] Document AI memory and code-context pipeline
- [ ] Document failure modes and operator runbooks

## Notes and Open Decisions

- [ ] Decide whether to keep `text-embedding-ada-002` exactly as specified or upgrade to a current embedding model before implementation
- [ ] Decide where uploaded source files are stored in production
- [ ] Decide whether AI generation runs inline in API or on separate async workers
- [ ] Decide whether session memory retrieval is scoped per user, per session, or both
