import { apiFetch } from "./apiClient";
import type { ApiResponse, FileDeleteResponse, FileRecord, FileUploadResponse, JobRecord, MessageRecord, QueueDepth, RateLimitBucketRecord, SessionRecord, WorkerRecord } from "./dashboard-types";
import type { TokenState } from "./authStorage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const dashboardApi = {
  listSessions: (tokenState: TokenState, setTokenState: (next: TokenState) => void) =>
    apiFetch<ApiResponse<{ items: SessionRecord[]; total: number; limit: number; offset: number }>>(API_BASE, tokenState, setTokenState, "/sessions?limit=200&offset=0").then((response) => response.data),
  createSession: (tokenState: TokenState, setTokenState: (next: TokenState) => void, title: string) =>
    apiFetch<ApiResponse<SessionRecord>>(API_BASE, tokenState, setTokenState, "/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((response) => response.data),
  listMessages: (tokenState: TokenState, setTokenState: (next: TokenState) => void, sessionId: string) =>
    apiFetch<ApiResponse<{ items: MessageRecord[]; total: number; limit: number; offset: number }>>(API_BASE, tokenState, setTokenState, `/sessions/${sessionId}/messages?limit=200&offset=0`).then((response) => response.data),
  sendMessage: (tokenState: TokenState, setTokenState: (next: TokenState) => void, sessionId: string, content: string) =>
    apiFetch<ApiResponse<MessageRecord>>(API_BASE, tokenState, setTokenState, `/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }).then((response) => response.data),
  createJob: (
    tokenState: TokenState,
    setTokenState: (next: TokenState) => void,
    jobType: string,
    payload: Record<string, unknown>,
    options?: { priority?: number; maxRetries?: number; scheduledAt?: string | null; idempotencyKey?: string | null },
  ) =>
    apiFetch<ApiResponse<JobRecord>>(API_BASE, tokenState, setTokenState, "/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        job_type: jobType,
        payload,
        priority: options?.priority ?? 5,
        max_retries: options?.maxRetries ?? 5,
        scheduled_at: options?.scheduledAt ?? null,
      }),
    }).then((response) => response.data),
  listFiles: (tokenState: TokenState, setTokenState: (next: TokenState) => void) =>
    apiFetch<ApiResponse<{ items: FileRecord[]; total: number; limit: number; offset: number }>>(API_BASE, tokenState, setTokenState, "/files?limit=200&offset=0").then((response) => response.data),
  uploadFile: (tokenState: TokenState, setTokenState: (next: TokenState) => void, file: File, sessionId?: string | null) => {
    const formData = new FormData();
    formData.append("file", file);
    if (sessionId) {
      formData.append("session_id", sessionId);
    }
    return apiFetch<ApiResponse<FileUploadResponse>>(API_BASE, tokenState, setTokenState, "/files", {
      method: "POST",
      body: formData,
    }).then((response) => response.data);
  },
  reindexFile: (tokenState: TokenState, setTokenState: (next: TokenState) => void, fileId: string, file: File, sessionId?: string | null) => {
    const formData = new FormData();
    formData.append("file", file);
    if (sessionId) {
      formData.append("session_id", sessionId);
    }
    return apiFetch<ApiResponse<FileUploadResponse>>(API_BASE, tokenState, setTokenState, `/files/${fileId}/reindex`, {
      method: "POST",
      body: formData,
    }).then((response) => response.data);
  },
  deleteFile: (tokenState: TokenState, setTokenState: (next: TokenState) => void, fileId: string) =>
    apiFetch<ApiResponse<FileDeleteResponse>>(API_BASE, tokenState, setTokenState, `/files/${fileId}`, {
      method: "DELETE",
    }).then((response) => response.data),
  listQueues: (tokenState: TokenState, setTokenState: (next: TokenState) => void) =>
    apiFetch<ApiResponse<{ queues: QueueDepth[] }>>(API_BASE, tokenState, setTokenState, "/ops/queues").then((response) => response.data),
  listWorkers: (tokenState: TokenState, setTokenState: (next: TokenState) => void) =>
    apiFetch<ApiResponse<{ workers: WorkerRecord[] }>>(API_BASE, tokenState, setTokenState, "/ops/workers").then((response) => response.data),
  listDeadLetters: (tokenState: TokenState, setTokenState: (next: TokenState) => void) =>
    apiFetch<ApiResponse<{ items: JobRecord[]; total: number; limit: number; offset: number }>>(API_BASE, tokenState, setTokenState, "/ops/jobs/dead-lettered?limit=100&offset=0").then((response) => response.data),
  listJobs: (tokenState: TokenState, setTokenState: (next: TokenState) => void) =>
    apiFetch<ApiResponse<{ items: JobRecord[]; total: number; limit: number; offset: number }>>(API_BASE, tokenState, setTokenState, "/tasks?limit=100&offset=0").then((response) => response.data),
  listRateLimits: (tokenState: TokenState, setTokenState: (next: TokenState) => void) =>
    apiFetch<ApiResponse<{ items: RateLimitBucketRecord[]; total: number; limit: number; offset: number }>>(API_BASE, tokenState, setTokenState, "/ops/rate-limits?limit=50&offset=0").then((response) => response.data),
  cancelJob: (tokenState: TokenState, setTokenState: (next: TokenState) => void, jobId: string) =>
    apiFetch<ApiResponse<{ status: string; job_id: string }>>(API_BASE, tokenState, setTokenState, `/tasks/${jobId}/cancel`, {
      method: "POST",
    }).then((response) => response.data),
  requeueJob: (tokenState: TokenState, setTokenState: (next: TokenState) => void, jobId: string) =>
    apiFetch<ApiResponse<{ status: string; job_id: string }>>(API_BASE, tokenState, setTokenState, `/ops/jobs/${jobId}/requeue`, {
      method: "POST",
    }).then((response) => response.data),
  cancelMessageStream: (tokenState: TokenState, setTokenState: (next: TokenState) => void, sessionId: string, messageId: string) =>
    apiFetch<ApiResponse<{ status: string }>>(API_BASE, tokenState, setTokenState, `/sessions/${sessionId}/messages/${messageId}/cancel`, {
      method: "POST",
    }).then((response) => response.data),
};
