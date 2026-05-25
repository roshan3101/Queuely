"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JobLauncher, { JobDraft } from "../components/JobLauncher";

type ApiResponse<T> = {
  success: boolean;
  data: T;
  request_id?: string | null;
};

type SessionRecord = {
  id: string;
  title: string;
  status: string;
  model_name: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRecord = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  sequence_number: number;
  created_at: string;
  referenced_files: string[];
};

type FileRecord = {
  id: string;
  session_id: string | null;
  original_name: string;
  language: string | null;
  status: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};

type QueueDepth = { name: string; depth: number };

type WorkerRecord = {
  worker_name: string;
  queue_name: string;
  hostname: string;
  process_id: number;
  last_seen_at: string;
  active_jobs: number;
  healthy: boolean;
};

type JobRecord = {
  id: string;
  job_type: string;
  status: string;
  queue_name: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
};

type QueuesRead = { queues: QueueDepth[] };
type WorkersRead = { workers: WorkerRecord[] };
type DeadLetterJobsRead = { items: JobRecord[]; total: number; limit: number; offset: number };
type JobListRead = { items: JobRecord[]; total: number; limit: number; offset: number };
type SessionListRead = { items: SessionRecord[]; total: number; limit: number; offset: number };
type MessageListRead = { items: MessageRecord[]; total: number; limit: number; offset: number };
type FileListRead = { items: FileRecord[]; total: number; limit: number; offset: number };

const API_BASE_STORAGE_KEY = "queuely.apiBase";
const TOKEN_STORAGE_KEY = "queuely.accessToken";
const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const WS_RECONNECT_BASE_MS = 600;
const WS_RECONNECT_MAX_MS = 8000;

type WsStatus = "disconnected" | "connecting" | "connected" | "error";

function readInitialSetting(key: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  return window.localStorage.getItem(key) ?? fallback;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function syntaxHighlight(code: string, language: string): string {
  const escaped = escapeHtml(code);
  const keywordSets: Record<string, string[]> = {
    python: [
      "def",
      "class",
      "return",
      "from",
      "import",
      "as",
      "if",
      "elif",
      "else",
      "for",
      "while",
      "try",
      "except",
      "with",
      "lambda",
      "yield",
      "await",
      "async",
      "pass",
      "raise",
      "in",
      "is",
      "not",
      "and",
      "or",
      "None",
      "True",
      "False",
    ],
    javascript: [
      "const",
      "let",
      "var",
      "function",
      "return",
      "if",
      "else",
      "for",
      "while",
      "try",
      "catch",
      "finally",
      "class",
      "extends",
      "new",
      "import",
      "from",
      "export",
      "async",
      "await",
      "switch",
      "case",
      "break",
      "continue",
      "of",
      "in",
      "null",
      "true",
      "false",
    ],
    typescript: [
      "const",
      "let",
      "var",
      "function",
      "return",
      "if",
      "else",
      "for",
      "while",
      "try",
      "catch",
      "finally",
      "class",
      "extends",
      "new",
      "import",
      "from",
      "export",
      "async",
      "await",
      "type",
      "interface",
      "enum",
      "implements",
      "private",
      "public",
      "protected",
      "readonly",
      "null",
      "true",
      "false",
    ],
  };
  const keywords = keywordSets[language] ?? keywordSets.javascript;

  let highlighted = escaped.replace(/(`[^`]+`)/g, '<span class="text-cyan-300">$1</span>');
  highlighted = highlighted.replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g, '<span class="text-amber-200">$1</span>');
  highlighted = highlighted.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="text-emerald-300">$1</span>');
  highlighted = highlighted.replace(new RegExp(`\\b(${keywords.join("|")})\\b`, "g"), '<span class="text-sky-300 font-semibold">$1</span>');
  highlighted = highlighted.replace(/(#.*$)/gm, '<span class="text-emerald-400">$1</span>');
  highlighted = highlighted.replace(/(\/\/.*$)/gm, '<span class="text-emerald-400">$1</span>');
  return highlighted;
}

function renderCodeFence(block: string) {
  const lines = block.split("\n");
  const language = (lines[0] || "").trim().toLowerCase();
  const code = lines.slice(1).join("\n");
  return { language, code };
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function apiFetch<T>(baseUrl: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return (await response.json()) as T;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function toWsUrl(apiBase: string): string {
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

function ReferencedFiles({
  files,
  referencedIds,
}: {
  files: Record<string, FileRecord>;
  referencedIds: string[];
}) {
  if (!referencedIds.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2 text-[11px]">
      {referencedIds.map((fileId) => {
        const file = files[fileId];
        return (
          <span key={fileId} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-cyan-200">
            {file ? file.original_name : shortId(fileId)}
          </span>
        );
      })}
    </div>
  );
}

function MessageBody({ content }: { content: string }) {
  const sections = content.split(/```([\s\S]*?)```/g);
  return (
    <div className="space-y-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200">
      {sections.map((section, index) => {
        if (index % 2 === 0) {
          return <p key={index}>{section}</p>;
        }
        const { language, code } = renderCodeFence(section);
        return (
          <div key={index} className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-zinc-400">
              <span>{language || "code"}</span>
              <span>syntax highlighted</span>
            </div>
            <pre
              className="overflow-x-auto p-4 text-[13px] leading-6 text-zinc-100"
              dangerouslySetInnerHTML={{
                __html: syntaxHighlight(code, language),
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [apiBase, setApiBase] = useState(() => readInitialSetting(API_BASE_STORAGE_KEY, DEFAULT_API_BASE));
  const [token, setToken] = useState(() => readInitialSetting(TOKEN_STORAGE_KEY, ""));
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ limit?: number; remaining?: number; reset?: number } | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [deadLetters, setDeadLetters] = useState<JobRecord[]>([]);
  const [opsJobs, setOpsJobs] = useState<JobRecord[]>([]);
  const [opsJobsOffset, setOpsJobsOffset] = useState<number>(0);
  const [opsJobsLimit] = useState<number>(30);
  const [opsJobStatus, setOpsJobStatus] = useState<string>("");
  const [opsJobType, setOpsJobType] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messageLimit, setMessageLimit] = useState<number>(100);
  const [messageTotal, setMessageTotal] = useState<number | null>(null);
  const [fileDetails, setFileDetails] = useState<FileRecord | null>(null);
  const [jobDraft, setJobDraft] = useState<JobDraft>({
    jobType: "pdf_processing",
    pdfFilePath: "",
    pdfPreviewChars: "500",
    pdfEnableOcr: true,
    pdfEnableTables: true,
    reportTitle: "",
    reportFormat: "json",
    reportProvider: "template",
    reportProviderModel: "",
    reportSummary: "",
    reportSections: "",
    emailTo: "",
    emailSubject: "",
    emailBody: "",
    emailHtml: "",
    emailDryRun: true,
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [opsBusy, setOpsBusy] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [wsReconnectAttempt, setWsReconnectAttempt] = useState<number>(0);
  const [lastPingAt, setLastPingAt] = useState<string | null>(null);
  const [currentStreamingMessageId, setCurrentStreamingMessageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectAttemptRef = useRef(0);
  const selectedJobIdRef = useRef<string | null>(null);
  const opsRefreshTimerRef = useRef<number | null>(null);

  const fileMap = useMemo(() => Object.fromEntries(files.map((file) => [file.id, file])), [files]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, apiBase);
  }, [apiBase]);

  useEffect(() => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }, [token]);

  async function loadSessions(nextActiveSessionId?: string | null) {
    let items: SessionRecord[] = [];
    try {
      const resp = await fetch(`${apiBase}/sessions`, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!resp.ok) throw new Error(await readApiError(resp));
      const payload = (await resp.json()) as ApiResponse<SessionListRead>;
      items = payload.data.items;
      setSessions(items);
      // read rate limit headers if present
      const limit = resp.headers.get("X-RateLimit-Limit");
      const remaining = resp.headers.get("X-RateLimit-Remaining");
      const reset = resp.headers.get("X-RateLimit-Reset");
      const parsed = { limit: limit ? Number(limit) : undefined, remaining: remaining ? Number(remaining) : undefined, reset: reset ? Number(reset) : undefined };
      setRateLimitInfo(parsed);
      if (parsed.reset !== undefined) {
        setRateLimitCountdown(parsed.reset);
      }
    } catch (err) {
      throw err;
    }
    const desiredId = nextActiveSessionId ?? activeSessionId ?? items[0]?.id ?? null;
    if (desiredId && desiredId !== activeSessionId) {
      setActiveSessionId(desiredId);
    }
    if (!items.length && token) {
      await createSession("Debug session");
    }
  }

  async function loadMessages(sessionId: string) {
    const params = new URLSearchParams();
    params.set("limit", String(messageLimit));
    params.set("offset", "0");
    const payload = await apiFetch<ApiResponse<MessageListRead>>(apiBase, token, `/sessions/${sessionId}/messages?${params.toString()}`);
    setMessages(payload.data.items);
    setMessageTotal(payload.data.total);
  }

  async function loadFiles() {
    const payload = await apiFetch<ApiResponse<FileListRead>>(apiBase, token, "/files?limit=100&offset=0");
    setFiles(payload.data.items);
  }

  async function loadOps() {
    const [queuesPayload, workersPayload, dlqPayload] = await Promise.all([
      apiFetch<ApiResponse<QueuesRead>>(apiBase, token, "/ops/queues"),
      apiFetch<ApiResponse<WorkersRead>>(apiBase, token, "/ops/workers"),
      apiFetch<ApiResponse<DeadLetterJobsRead>>(apiBase, token, "/ops/jobs/dead-lettered?limit=20&offset=0"),
    ]);
    setQueues(queuesPayload.data.queues);
    setWorkers(workersPayload.data.workers);
    setDeadLetters(dlqPayload.data.items);
  }

  async function loadOpsJobs() {
    const params = new URLSearchParams();
    params.set("limit", String(opsJobsLimit));
    params.set("offset", String(opsJobsOffset));
    if (opsJobStatus) params.set("status", opsJobStatus);
    if (opsJobType) params.set("job_type", opsJobType);
    const payload = await apiFetch<ApiResponse<JobListRead>>(apiBase, token, `/ops/jobs?${params.toString()}`);
    setOpsJobs(payload.data.items);
  }

  async function prevOpsPage() {
    if (opsJobsOffset <= 0) return;
    setOpsJobsOffset(Math.max(0, opsJobsOffset - opsJobsLimit));
  }

  async function nextOpsPage() {
    setOpsJobsOffset(opsJobsOffset + opsJobsLimit);
  }

  async function loadJobDetail(jobId: string) {
    const payload = await apiFetch<ApiResponse<JobRecord>>(apiBase, token, `/ops/jobs/${jobId}`);
    setSelectedJob(payload.data);
  }

  async function deleteFile(fileId: string) {
    setApiError(null);
    setOpsBusy(true);
    try {
      const resp = await fetch(`${apiBase}/files/${fileId}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!resp.ok) throw new Error(await readApiError(resp));
      await loadFiles();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to delete file.");
    } finally {
      setOpsBusy(false);
    }
  }

  async function reindexFilePrompt(fileId: string) {
    // create a temporary file input to choose a replacement file for reindex
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setOpsBusy(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const resp = await fetch(`${apiBase}/files/${fileId}/reindex`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: formData });
        if (!resp.ok) throw new Error(await readApiError(resp));
        await loadFiles();
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Failed to reindex file.");
      } finally {
        setOpsBusy(false);
      }
    };
    input.click();
  }

  async function refreshAll() {
    if (!token) return;
    setApiError(null);
    setIsLoading(true);
    try {
      await Promise.all([loadSessions(), loadFiles(), loadOps()]);
      if (activeSessionId) {
        await loadMessages(activeSessionId);
      }
      setLastSyncAt(new Date().toISOString());
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    const initialLoad = window.setTimeout(() => {
      void refreshAll();
    }, 0);
    const timer = window.setInterval(() => {
      void loadOps().catch(() => undefined);
    }, 12000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, apiBase]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      void loadOpsJobs().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, apiBase, opsJobStatus, opsJobType, opsJobsOffset, opsJobsLimit]);

  useEffect(() => {
    if (!token || !activeSessionId) return;
    const timer = window.setTimeout(() => {
      void loadMessages(activeSessionId).catch((error) => {
        setApiError(error instanceof Error ? error.message : "Failed to load messages.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSessionId, apiBase, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || !activeSessionId) return;
    void loadMessages(activeSessionId).catch((error) => {
      setApiError(error instanceof Error ? error.message : "Failed to load messages.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageLimit]);

  useEffect(() => {
    selectedJobIdRef.current = selectedJob?.id ?? null;
  }, [selectedJob]);

  useEffect(() => {
    if (!token || !isOnline) {
      wsRef.current?.close();
      wsRef.current = null;
      window.setTimeout(() => setWsStatus("disconnected"), 0);
      return;
    }

    let closed = false;
    const connect = () => {
      if (closed) return;
      window.setTimeout(() => setWsStatus("connecting"), 0);

      const wsUrl = new URL(toWsUrl(apiBase));
      wsUrl.searchParams.set("token", token);
      // include last sync time to enable replay on reconnect
      if (lastSyncAt) {
        wsUrl.searchParams.set("since", lastSyncAt);
      }
      const socket = new WebSocket(wsUrl.toString());
      wsRef.current = socket;

      socket.onopen = () => {
        wsReconnectAttemptRef.current = 0;
        setWsReconnectAttempt(0);
        setWsStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            job_id?: string;
            sent_at?: string;
            connection_id?: string;
            replayed?: boolean;
          };
          if (payload.type === "ping") {
            // show last ping time for UX
            setLastPingAt(payload.sent_at ?? new Date().toISOString());
            return;
          }
          if (payload.type === "job_event") {
            // Debounce ops refreshes when many events arrive.
            if (opsRefreshTimerRef.current) {
              window.clearTimeout(opsRefreshTimerRef.current);
            }
            opsRefreshTimerRef.current = window.setTimeout(() => {
              void loadOps().catch(() => undefined);
              void loadOpsJobs().catch(() => undefined);
              const selectedId = selectedJobIdRef.current;
              if (selectedId && payload.job_id && payload.job_id === selectedId) {
                void loadJobDetail(selectedId).catch(() => undefined);
              }
            }, 250);
          }
        } catch {
          // ignore
        }
      };

      socket.onerror = () => {
        setWsStatus("error");
      };

      socket.onclose = () => {
        wsRef.current = null;
        if (closed) return;
        window.setTimeout(() => setWsStatus("disconnected"), 0);
        const attempt = (wsReconnectAttemptRef.current += 1);
        setWsReconnectAttempt(attempt);
        const delay = Math.min(WS_RECONNECT_MAX_MS, WS_RECONNECT_BASE_MS * 2 ** Math.min(8, attempt));
        window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
      wsRef.current = null;
      window.setTimeout(() => setWsStatus("disconnected"), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, token, isOnline]);

  useEffect(() => {
    if (rateLimitCountdown === null) return;
    const start = Date.now();
    let remaining = rateLimitCountdown;
    setRateLimitCountdown(remaining);
    const id = setInterval(() => {
      remaining = Math.max(0, rateLimitCountdown - Math.floor((Date.now() - start) / 1000));
      setRateLimitCountdown(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateLimitInfo?.reset]);

  async function createSession(title?: string) {
    const nextTitle = title ?? (sessionTitle.trim() || `Debug session ${new Date().toLocaleString()}`);
    const payload = await apiFetch<ApiResponse<SessionRecord>>(apiBase, token, "/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    setSessionTitle("");
    await loadSessions(payload.data.id);
    setActiveSessionId(payload.data.id);
    await loadMessages(payload.data.id);
  }

  async function sendMessage() {
    if (!activeSessionId || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    setApiError(null);
    setIsStreaming(true);

    const userMessage: MessageRecord = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      sequence_number: messages.length + 1,
      created_at: new Date().toISOString(),
      referenced_files: [],
    };
    const assistantId = crypto.randomUUID();
    let activeAssistantId = assistantId;
    const assistantMessage: MessageRecord = {
      id: assistantId,
      role: "assistant",
      content: "",
      sequence_number: messages.length + 2,
      created_at: new Date().toISOString(),
      referenced_files: [],
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      const response = await fetch(`${apiBase}/sessions/${activeSessionId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Streaming response is not available.");
      }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex >= 0) {
          const block = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          const lines = block.split("\n");
          const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
          const data = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");

          if (eventName === "meta") {
            // server-assigned assistant message id
            try {
              const serverId = data;
              setCurrentStreamingMessageId(serverId);
              activeAssistantId = serverId;
              // patch the temporary assistant id to the server id
              setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, id: serverId } : message)));
            } catch {
              // ignore
            }
          }

          if (eventName === "delta") {
            setMessages((current) =>
              current.map((message) => (message.id === activeAssistantId ? { ...message, content: `${message.content}${data}` } : message)),
            );
          }

          if (eventName === "done") {
            await loadMessages(activeSessionId);
            await loadFiles();
            setCurrentStreamingMessageId(null);
          }

          separatorIndex = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Message stream failed.");
      await loadMessages(activeSessionId);
    } finally {
      setIsStreaming(false);
    }
  }

  async function cancelStream() {
    if (!activeSessionId) return;
    const messageId = currentStreamingMessageId;
    if (!messageId) return;
    setApiError(null);
    try {
      const response = await fetch(`${apiBase}/sessions/${activeSessionId}/messages/${messageId}/cancel`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      // refresh messages to reflect cancellation
      await loadMessages(activeSessionId);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to cancel stream.");
    } finally {
      setIsStreaming(false);
      setCurrentStreamingMessageId(null);
    }
  }

  async function uploadFile(file: File) {
    if (!activeSessionId) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", activeSessionId);
    setOpsBusy(true);
    setApiError(null);
    try {
      const response = await fetch(`${apiBase}/files`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      await loadFiles();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setOpsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function requeueJob(jobId: string) {
    setOpsBusy(true);
    try {
      const response = await fetch(`${apiBase}/ops/jobs/${jobId}/requeue`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      await loadOps();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to requeue job.");
    } finally {
      setOpsBusy(false);
    }
  }

  function buildReportSectionsInput(raw: string): Array<{ heading: string; body: string }> {
    return raw
      .split(/\n\s*\n/g)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block, index) => {
        const lines = block.split("\n");
        const heading = lines[0]?.trim() || `Section ${index + 1}`;
        const body = lines.slice(1).join("\n").trim();
        return { heading, body };
      });
  }

  function buildJobPayload() {
    if (jobDraft.jobType === "pdf_processing") {
      return {
        job_type: "pdf_processing",
        payload: {
          file_path: jobDraft.pdfFilePath.trim(),
          preview_chars: Number(jobDraft.pdfPreviewChars || "500"),
          enable_ocr: jobDraft.pdfEnableOcr,
          enable_table_extraction: jobDraft.pdfEnableTables,
        },
        priority: 5,
        max_retries: 3,
      };
    }

    if (jobDraft.jobType === "report_generation") {
      return {
        job_type: "report_generation",
        payload: {
          title: jobDraft.reportTitle.trim() || undefined,
          format: jobDraft.reportFormat,
          provider: jobDraft.reportProvider,
          provider_model: jobDraft.reportProviderModel.trim() || undefined,
          summary: jobDraft.reportSummary.trim() || undefined,
          sections: buildReportSectionsInput(jobDraft.reportSections),
        },
        priority: 5,
        max_retries: 2,
      };
    }

    return {
      job_type: "email_sending",
      payload: {
        to: jobDraft.emailTo.trim(),
        subject: jobDraft.emailSubject.trim(),
        body: jobDraft.emailBody,
        html: jobDraft.emailHtml.trim() || undefined,
        dry_run: jobDraft.emailDryRun,
      },
      priority: 6,
      max_retries: 2,
    };
  }

  async function submitJob() {
    setApiError(null);
    setOpsBusy(true);
    try {
      const response = await fetch(`${apiBase}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildJobPayload()),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const limit = response.headers.get("X-RateLimit-Limit");
      const remaining = response.headers.get("X-RateLimit-Remaining");
      const reset = response.headers.get("X-RateLimit-Reset");
      setRateLimitInfo({
        limit: limit ? Number(limit) : undefined,
        remaining: remaining ? Number(remaining) : undefined,
        reset: reset ? Number(reset) : undefined,
      });
      if (reset) {
        setRateLimitCountdown(Number(reset));
      }
      const payload = (await response.json()) as ApiResponse<JobRecord>;
      await Promise.all([loadOps(), loadOpsJobs()]);
      await loadJobDetail(payload.data.id);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to submit job.");
    } finally {
      setOpsBusy(false);
    }
  }

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_#081018_0%,_#02060b_100%)] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-2xl shadow-cyan-950/10 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Queuely</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Debug sessions, retrieval, and ops in one surface</h1>
              <p className="mt-1 max-w-3xl text-sm text-zinc-400">
                Session memory, codebase context, streaming assistant replies, and queue operations are wired against the backend.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">API Base</span>
                <input
                  value={apiBase}
                  onChange={(event) => setApiBase(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                />
              </label>
              <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">JWT</span>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                  placeholder="Bearer token"
                />
              </label>
              <div className="flex items-end gap-2">
                <button
                  onClick={() => void refreshAll()}
                  className="h-11 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  Refresh
                </button>
                <button
                  onClick={() => void createSession()}
                  className="h-11 rounded-2xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  New session
                </button>
              </div>
            </div>
            {rateLimitInfo ? (
              <div className="mt-2 text-[12px] text-zinc-400">Rate limit: {rateLimitInfo.remaining ?? "?"}/{rateLimitInfo.limit ?? "?"} reset in {rateLimitInfo.reset ?? "?"}s</div>
            ) : null}
          </div>
        </header>

        {!token ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Paste a JWT access token to load sessions and ops data.
          </div>
        ) : null}

        {apiError ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div>{apiError}</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void refreshAll()}
                className="rounded-xl border border-rose-500/30 bg-black/20 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-black/30"
              >
                Retry
              </button>
              <button
                onClick={() => setApiError(null)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200 transition hover:bg-black/30"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-300 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 ${
                isOnline
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-400/20 bg-rose-400/10 text-rose-100"
              }`}
            >
              {isOnline ? "online" : "offline"}
            </span>
            <span
              className={`rounded-full border px-3 py-1 ${
                wsStatus === "connected"
                  ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-black/20 text-zinc-300"
              }`}
            >
              ws: {wsStatus}
              {wsReconnectAttempt > 0 ? ` (attempt ${wsReconnectAttempt})` : null}
              {lastPingAt ? ` • ping ${new Date(lastPingAt).toLocaleTimeString()}` : null}
            </span>
            <button
              disabled={!wsRef.current || wsStatus !== "connected"}
              onClick={() => {
                try {
                  wsRef.current?.send(JSON.stringify({ type: "replay" }));
                } catch {
                  // ignore
                }
              }}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200 transition hover:bg-black/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Resync
            </button>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "never"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={!token || isLoading}
              onClick={() => void refreshAll()}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200 transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sync now
            </button>
          </div>
        </div>

        <div className="grid flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_420px]">
          <aside className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-300">Sessions</h2>
                <p className="mt-1 text-xs text-zinc-500">{sessions.length} available</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">New title</span>
                <input
                  value={sessionTitle}
                  onChange={(event) => setSessionTitle(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                  placeholder="Design review session"
                />
              </label>
              <button
                onClick={() => void createSession()}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
              >
                Create session
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    session.id === activeSessionId
                      ? "border-cyan-400/40 bg-cyan-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-white">{session.title}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                      {session.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>{session.model_name ?? "unbound"}</span>
                    <span>{shortId(session.id)}</span>
                  </div>
                </button>
              ))}
              {!sessions.length ? <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">No sessions yet.</p> : null}
            </div>

            <div className="mt-6 rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">File context</h3>
                <span className="text-xs text-zinc-500">{files.length} files</span>
              </div>
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                  className="block w-full cursor-pointer rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-950"
                />
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                {files.slice(0, 8).map((file) => (
                  <div key={file.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => setFileDetails(file)} className="truncate text-sm text-white text-left">
                        {file.original_name}
                      </button>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{file.status}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>{file.language ?? "plain text"}</span>
                      <span>{formatBytes(file.size_bytes)}</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => reindexFilePrompt(file.id)}
                        disabled={opsBusy}
                        className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-black/30 disabled:opacity-40"
                      >
                        Reindex
                      </button>
                      <button
                        onClick={() => deleteFile(file.id)}
                        disabled={opsBusy}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <JobLauncher jobDraft={jobDraft} setJobDraft={setJobDraft} submitJob={() => void submitJob()} opsBusy={opsBusy} />
          </aside>

          <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur">
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{activeSession?.title ?? "Select a session"}</h2>
                <p className="text-sm text-zinc-500">
                  {isLoading ? "Refreshing..." : activeSession ? `Session ${shortId(activeSession.id)}` : "Create or select a debug session to continue."}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{messages.length} messages</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{isStreaming ? "streaming" : "idle"}</span>
              </div>
            </div>

            <div className="max-h-[calc(100vh-23rem)] min-h-[28rem] overflow-y-auto px-5 py-5">
              <div className="space-y-4">
                {messageTotal && messageTotal > messages.length ? (
                  <div className="mb-2 text-center">
                    <button
                      onClick={() => {
                        setMessageLimit(messageLimit + 100);
                        void loadMessages(activeSessionId!);
                      }}
                      className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200 transition hover:bg-black/30"
                    >
                      Load more messages ({messageTotal - messages.length} older)
                    </button>
                  </div>
                ) : null}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`rounded-[24px] border p-4 ${
                      message.role === "user"
                        ? "ml-auto max-w-[85%] border-cyan-400/20 bg-cyan-400/10"
                        : "mr-auto max-w-[92%] border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">{message.role}</span>
                      <span className="text-[11px] text-zinc-500">#{message.sequence_number}</span>
                    </div>
                    <MessageBody content={message.content} />
                    <ReferencedFiles files={fileMap} referencedIds={message.referenced_files} />
                  </article>
                ))}
                {!messages.length ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/10 p-8 text-center text-sm text-zinc-500">
                    No messages yet. Send a prompt to start a streaming assistant reply.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-white/10 p-5">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={5}
                  placeholder="Ask a question about the current debug session, uploaded files, or generated output..."
                  className="w-full resize-none bg-transparent text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500">
                    Streaming uses <code>POST /sessions/{"{session_id}"}/messages/stream</code> and persists the final assistant response plus provenance.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={!activeSessionId || !draft.trim() || isStreaming}
                      onClick={() => void sendMessage()}
                      className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isStreaming ? "Sending..." : "Send message"}
                    </button>
                    {isStreaming ? (
                      <button
                        onClick={() => void cancelStream()}
                        className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-300">Operations</h2>
                <p className="mt-1 text-xs text-zinc-500">Queue health, workers, and dead letters</p>
              </div>
              <button
                onClick={() => void loadOps()}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
              >
                Refresh ops
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Queue depths</h3>
                  <span className="text-xs text-zinc-500">{queues.length} queues</span>
                </div>
                <div className="mt-3 space-y-2">
                  {queues.map((queue) => (
                    <div key={queue.name} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-200">{queue.name}</span>
                        <span className="font-mono text-cyan-200">{queue.depth}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500"
                          style={{ width: `${Math.min(100, queue.depth * 12)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {!queues.length ? <p className="text-sm text-zinc-500">No queue data loaded.</p> : null}
                </div>
              </section>

              <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Workers</h3>
                  <span className="text-xs text-zinc-500">{workers.length} tracked</span>
                </div>
                <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                  {workers.map((worker) => (
                    <div key={`${worker.worker_name}-${worker.process_id}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-white">{worker.worker_name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${
                            worker.healthy ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"
                          }`}
                        >
                          {worker.healthy ? "healthy" : "stale"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {worker.queue_name} | {worker.hostname} | pid {worker.process_id}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">{worker.active_jobs} active jobs</div>
                    </div>
                  ))}
                  {!workers.length ? <p className="text-sm text-zinc-500">No worker heartbeats yet.</p> : null}
                </div>
              </section>

              <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Jobs</h3>
                  <button
                    onClick={() => void loadOpsJobs()}
                    className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition hover:bg-black/30"
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Status</span>
                    <input
                      value={opsJobStatus}
                      onChange={(event) => setOpsJobStatus(event.target.value)}
                      className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                      placeholder="queued"
                    />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Type</span>
                    <input
                      value={opsJobType}
                      onChange={(event) => setOpsJobType(event.target.value)}
                      className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                      placeholder="pdf_processing"
                    />
                  </label>
                </div>
                <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                  {opsJobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => void loadJobDetail(job.id)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-white">{job.job_type}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{job.status}</span>
                      </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                          <span className="truncate">{job.queue_name}</span>
                          <span className="font-mono">{shortId(job.id)}</span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-400 max-h-12 overflow-hidden">{job.error_message ? job.error_message : JSON.stringify(job.result ?? {})}</div>
                    </button>
                  ))}
                  {!opsJobs.length ? <p className="text-sm text-zinc-500">No jobs loaded.</p> : null}
                </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-zinc-400">Showing {opsJobs.length} jobs</div>
                    <div className="flex gap-2">
                      <button onClick={() => { prevOpsPage(); void loadOpsJobs(); }} disabled={opsJobsOffset<=0} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-200">Prev</button>
                      <button onClick={() => { nextOpsPage(); void loadOpsJobs(); }} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-200">Next</button>
                    </div>
                  </div>
              </section>

              <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Dead letters</h3>
                  <span className="text-xs text-zinc-500">{deadLetters.length} items</span>
                </div>
                <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                  {deadLetters.map((job) => (
                    <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-white">{job.job_type}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{job.status}</span>
                      </div>
                      <div className="mt-1 max-h-10 overflow-hidden text-xs text-zinc-400">{job.error_message ?? "No error message."}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-zinc-500">{shortId(job.id)}</span>
                        <button
                          disabled={opsBusy}
                          onClick={() => void requeueJob(job.id)}
                          className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Requeue
                        </button>
                      </div>
                    </div>
                  ))}
                  {!deadLetters.length ? <p className="text-sm text-zinc-500">No dead letters loaded.</p> : null}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>

      {selectedJob ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur sm:items-center">
          <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#060c12] shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Job detail</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{selectedJob.job_type}</h3>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200 transition hover:bg-black/40"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Identifiers</div>
                <div className="mt-2 space-y-2 text-sm text-zinc-200">
                  <div>
                    <div className="text-[11px] text-zinc-500">Job ID</div>
                    <div className="font-mono">{selectedJob.id}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500">Queue</div>
                    <div>{selectedJob.queue_name}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500">Status</div>
                    <div>{selectedJob.status}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Error / Result</div>
                <div className="mt-2 space-y-2 text-sm text-zinc-200">
                  <div>
                    <div className="text-[11px] text-zinc-500">Error</div>
                    <div className="max-h-24 overflow-auto whitespace-pre-wrap">{selectedJob.error_message ?? "None"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500">Result</div>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-[12px] text-zinc-100">
                      {JSON.stringify(selectedJob.result ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Payload</div>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-[12px] text-zinc-100">
                  {JSON.stringify(selectedJob.payload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {fileDetails ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur sm:items-center">
          <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#060c12] shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">File</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{fileDetails.original_name}</h3>
              </div>
              <button onClick={() => setFileDetails(null)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200">Close</button>
            </div>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">File info</div>
                <div className="mt-2 space-y-2 text-sm text-zinc-200">
                  <div>
                    <div className="text-[11px] text-zinc-500">Name</div>
                    <div>{fileDetails.original_name}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500">Language</div>
                    <div>{fileDetails.language ?? "plain text"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500">Size</div>
                    <div>{formatBytes(fileDetails.size_bytes)}</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => reindexFilePrompt(fileDetails.id)} disabled={opsBusy} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">Reindex</button>
                  <button onClick={async () => { await deleteFile(fileDetails.id); setFileDetails(null); }} disabled={opsBusy} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">Delete</button>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Preview</div>
                <div className="mt-2 max-h-56 overflow-auto text-sm text-zinc-200">
                  <pre className="whitespace-pre-wrap">{fileDetails.original_name}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
