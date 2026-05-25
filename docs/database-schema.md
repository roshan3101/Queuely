# Database Schema

## Tables

### `users`

- Stores authenticated platform users
- Unique key: `email`
- Flags: `is_active`, `is_superuser`

### `refresh_tokens`

- Stores JWT refresh token sessions
- Foreign key: `user_id -> users.id`
- Unique key: `token_jti`
- Supports token revocation and session-level logout

### `jobs`

- Durable record for submitted async work
- Foreign key: `user_id -> users.id`
- Enums:
  - `job_type_enum`: `pdf_processing`, `report_generation`, `email_sending`, `custom`
  - `job_status_enum`: `pending`, `queued`, `running`, `succeeded`, `failed`, `retrying`, `dead_lettered`, `cancelled`
- Important columns:
  - `queue_name`: logical Celery queue
  - `celery_task_id`: Celery task identifier
  - `idempotency_key`: protects against duplicate submissions
  - `payload`: original job input
  - `result`: normalized execution result
  - `error_message`: terminal failure detail
  - `priority`, `max_retries`, `retry_count`
  - `scheduled_at`, `started_at`, `completed_at`, `last_heartbeat_at`
- Indexes:
  - `user_id, status, created_at`
  - `queue_name, status, priority`

### `job_events`

- Append-only audit trail of job state transitions and operator-visible events
- Foreign key: `job_id -> jobs.id`
- Columns:
  - `event_type`
  - `status`
  - `message`
  - `metadata`
  - `created_at`

### `rate_limit_buckets`

- Persistent token bucket state per user and bucket name
- Foreign key: `user_id -> users.id`
- Unique constraint: `user_id + bucket_name`
- Columns:
  - `capacity`
  - `refill_rate`
  - `tokens`
  - `last_refill_at`

### `worker_heartbeats`

- Latest known state for each worker process identity
- Unique key: `worker_name`
- Columns:
  - `queue_name`
  - `hostname`
  - `process_id`
  - `last_seen_at`
- `active_jobs`
- `metadata`

### `debug_sessions`

- Top-level conversation container for the AI debug workflow
- Foreign key: `user_id -> users.id`
- Stores:
  - `title`
  - `status`
  - `model_name`
  - `system_prompt`
  - `summary`
  - `last_message_at`
  - `metadata`

### `conversation_messages`

- Every user, assistant, system, or tool message is stored here
- Foreign keys:
  - `session_id -> debug_sessions.id`
  - `user_id -> users.id`
  - `response_to_message_id -> conversation_messages.id`
- Stores:
  - `role`
  - `content`
  - `sequence_number`
  - `token_count`
  - `embedding`
  - `metadata`
- Retrieval rule:
  - top 5 semantically similar past exchanges are retrieved from this table using `pgvector`

### `uploaded_files`

- Stores metadata for codebase-context uploads
- Foreign keys:
  - `user_id -> users.id`
  - `session_id -> debug_sessions.id` nullable
- Stores:
  - `original_name`
  - `storage_path`
  - `mime_type`
  - `language`
  - `sha256_hash`
  - `size_bytes`
  - `status`
  - `metadata`

### `file_chunks`

- Stores chunked source-code content for retrieval
- Foreign key: `file_id -> uploaded_files.id`
- Stores:
  - `chunk_index`
  - `content`
  - `token_count`
  - `embedding`
  - `language`
  - `start_line`
  - `end_line`
  - `metadata`

### `response_references`

- Provenance table showing which prior memory messages or file chunks were used by an assistant response
- Foreign keys:
  - `assistant_message_id -> conversation_messages.id`
  - `referenced_message_id -> conversation_messages.id` nullable
  - `referenced_file_id -> uploaded_files.id` nullable
  - `referenced_chunk_id -> file_chunks.id` nullable
- Stores:
  - `source_type`
  - `rank`
  - `similarity_score`
  - `snippet`
  - `metadata`

## Design Notes

- PostgreSQL is the source of truth for all user-facing job state.
- Celery metadata is operational only and should never be the only place where status lives.
- Dead-letter handling will update `jobs.status = dead_lettered` and emit a matching `job_events` record.
- Token bucket state is persisted so horizontal API replicas enforce the same rate-limiting view.
- Message and file-chunk embeddings use `pgvector` so both memory retrieval and code-context retrieval stay in PostgreSQL.
- Assistant responses can expose exact referenced files through `response_references`.
- Context assembly will pull from recent history, semantically similar messages, and relevant file chunks while enforcing a token budget.
