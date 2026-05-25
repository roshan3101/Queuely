"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
type SessionListRead = { items: SessionRecord[]; total: number; limit: number; offset: number };
type MessageListRead = { items: MessageRecord[]; total: number; limit: number; offset: number };
type FileListRead = { items: FileRecord[]; total: number; limit: number; offset: number };

const API_BASE_STORAGE_KEY = "queuely.apiBase";
const TOKEN_STORAGE_KEY = "queuely.accessToken";
const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [deadLetters, setDeadLetters] = useState<JobRecord[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [opsBusy, setOpsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fileMap = useMemo(() => Object.fromEntries(files.map((file) => [file.id, file])), [files]);

  useEffect(() => {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, apiBase);
  }, [apiBase]);

  useEffect(() => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }, [token]);

  async function loadSessions(nextActiveSessionId?: string | null) {
    const payload = await apiFetch<ApiResponse<SessionListRead>>(apiBase, token, "/sessions");
    setSessions(payload.data.items);
    const desiredId = nextActiveSessionId ?? activeSessionId ?? payload.data.items[0]?.id ?? null;
    if (desiredId && desiredId !== activeSessionId) {
      setActiveSessionId(desiredId);
    }
    if (!payload.data.items.length && token) {
      await createSession("Debug session");
    }
  }

  async function loadMessages(sessionId: string) {
    const payload = await apiFetch<ApiResponse<MessageListRead>>(apiBase, token, `/sessions/${sessionId}/messages?limit=100&offset=0`);
    setMessages(payload.data.items);
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

  async function refreshAll() {
    if (!token) return;
    setApiError(null);
    setIsLoading(true);
    try {
      await Promise.all([loadSessions(), loadFiles(), loadOps()]);
      if (activeSessionId) {
        await loadMessages(activeSessionId);
      }
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
    if (!token || !activeSessionId) return;
    const timer = window.setTimeout(() => {
      void loadMessages(activeSessionId).catch((error) => {
        setApiError(error instanceof Error ? error.message : "Failed to load messages.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSessionId, apiBase, token]); // eslint-disable-line react-hooks/exhaustive-deps

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

          if (eventName === "delta") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, content: `${message.content}${data}` } : message,
              ),
            );
          }

          if (eventName === "done") {
            await loadMessages(activeSessionId);
            await loadFiles();
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
          </div>
        </header>

        {apiError ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{apiError}</div>
        ) : null}

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
                      <span className="truncate text-sm text-white">{file.original_name}</span>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{file.status}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>{file.language ?? "plain text"}</span>
                      <span>{formatBytes(file.size_bytes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                  <button
                    disabled={!activeSessionId || !draft.trim() || isStreaming}
                    onClick={() => void sendMessage()}
                    className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isStreaming ? "Sending..." : "Send message"}
                  </button>
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
    </main>
  );
}
