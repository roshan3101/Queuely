"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { FileRecord, MessageRecord, SessionRecord } from "@/lib/dashboard-types";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, RefreshCw, Send, StopCircle, Terminal, HelpCircle, FileCode } from "lucide-react";

export default function SessionsPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);

  // Form states
  const [newTitle, setNewTitle] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  
  // Interaction states
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  const loadInitialData = async () => {
    if (!ready || !tokenState.accessToken) return;
    setLoading(true);
    try {
      const sessList = await dashboardApi.listSessions(tokenState, setTokenState);
      setSessions(sessList.items);
      if (sessList.items.length > 0 && !activeSessionId) {
        setActiveSessionId(sessList.items[0].id);
      }
      const filesList = await dashboardApi.listFiles(tokenState, setTokenState);
      setFiles(filesList.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [ready, tokenState]);

  // Load message logs when active session transitions
  useEffect(() => {
    if (!activeSessionId || !ready || !tokenState.accessToken) return;
    void dashboardApi.listMessages(tokenState, setTokenState, activeSessionId).then((data) => {
      setMessages(data.items);
    });
  }, [activeSessionId, ready, tokenState]);

  // Scroll active chat area down
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const handleCreateSession = async () => {
    if (!newTitle.trim()) return;
    try {
      const created = await dashboardApi.createSession(tokenState, setTokenState, newTitle.trim());
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setNewTitle("");
      toast({ title: "Session spawned", description: `Session ${created.title} created.`, variant: "success" });
    } catch (e) {
      toast({ title: "Failed to spawn session", description: "An error occurred.", variant: "error" });
    }
  };

  const handleUploadContextFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await dashboardApi.uploadFile(tokenState, setTokenState, file, activeSessionId);
      toast({ title: "Context added", description: `${file.name} uploaded successfully.`, variant: "success" });
      const filesList = await dashboardApi.listFiles(tokenState, setTokenState);
      setFiles(filesList.items);
    } catch (e) {
      toast({ title: "Upload failed", description: "An error occurred.", variant: "error" });
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await dashboardApi.deleteFile(tokenState, setTokenState, fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast({ title: "File purged", description: "Successfully removed codebase context.", variant: "success" });
    } catch (e) {
      toast({ title: "Purge failed", description: "An error occurred.", variant: "error" });
    }
  };

  // POST request-based stream reader loop
  const handleSendPrompt = async () => {
    if (!promptDraft.trim() || !activeSessionId || streaming) return;
    const content = promptDraft.trim();
    setPromptDraft("");
    setStreaming(true);

    // Optimistically push the User message
    const tempUserMsg: MessageRecord = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      sequence_number: messages.length + 1,
      created_at: new Date().toISOString(),
      referenced_files: [],
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    // Push placeholder Assistant message
    const tempAssistantMsgId = crypto.randomUUID();
    const tempAssistantMsg: MessageRecord = {
      id: tempAssistantMsgId,
      role: "assistant",
      content: "",
      sequence_number: messages.length + 2,
      created_at: new Date().toISOString(),
      referenced_files: [],
    };
    setMessages((prev) => [...prev, tempAssistantMsg]);

    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    const streamUrl = `${API_BASE}/sessions/${activeSessionId}/messages/stream`;

    try {
      const response = await fetch(streamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenState.accessToken}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.body) throw new Error("Null response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          // Process SSE custom event schema: "event: delta\ndata: text"
          const eventMatch = line.match(/^event:\s*(\w+)/);
          const dataMatch = line.match(/data:\s*(.*)$/m);

          if (eventMatch && dataMatch) {
            const eventName = eventMatch[1];
            const dataVal = dataMatch[1];

            if (eventName === "meta") {
              setActiveMessageId(dataVal);
              setMessages((prev) =>
                prev.map((m) => (m.id === tempAssistantMsgId ? { ...m, id: dataVal } : m))
              );
            } else if (eventName === "delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantMsgId || m.id === activeMessageId
                    ? { ...m, content: m.content + dataVal }
                    : m
                )
              );
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Streaming failed", description: "Stream connection terminated abnormally.", variant: "error" });
    } finally {
      setStreaming(false);
      setActiveMessageId(null);
      // Reload final committed values to capture references & provenance mappings
      void dashboardApi.listMessages(tokenState, setTokenState, activeSessionId).then((data) => {
        setMessages(data.items);
      });
    }
  };

  const handleCancelStream = async () => {
    if (!activeSessionId || !activeMessageId) return;
    try {
      await dashboardApi.cancelMessageStream(tokenState, setTokenState, activeSessionId, activeMessageId);
      toast({ title: "Stream halted", description: "Interrupted LLM inference session.", variant: "info" });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      {/* SIDEBAR CONSOLE */}
      <aside className="space-y-6">
        <Card className="border-zinc-800 bg-zinc-950 text-zinc-50">
          <CardHeader className="pb-3 border-b border-zinc-800/60">
            <CardTitle className="font-mono text-xs uppercase tracking-wider text-zinc-400">Spawn Session</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Session title..."
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono text-white outline-none focus:border-zinc-500"
            />
            <button
              onClick={() => void handleCreateSession()}
              className="w-full rounded-md bg-white px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wider text-black transition hover:bg-zinc-200"
            >
              Spawn UUID
            </button>
          </CardContent>
        </Card>

        {/* SESSION SELECTOR */}
        <Card className="border-zinc-800 bg-zinc-950 text-zinc-50">
          <CardHeader className="pb-3 border-b border-zinc-800/60">
            <CardTitle className="font-mono text-xs uppercase tracking-wider text-zinc-400">Sessions</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2 max-h-56 overflow-y-auto pr-1">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  s.id === activeSessionId
                    ? "border-white bg-zinc-900"
                    : "border-zinc-850 bg-zinc-950 hover:bg-zinc-900/40"
                }`}
              >
                <div className="font-mono text-xs font-bold text-white truncate">{s.title}</div>
                <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>UUID: {s.id.slice(0, 8)}</span>
                </div>
              </button>
            ))}
            {!sessions.length && (
              <div className="text-center py-4 text-xs font-mono text-zinc-600">NO SESSION CONSOLE FOUND.</div>
            )}
          </CardContent>
        </Card>

        {/* CODEBASE CONTEXT UPLOADS */}
        <Card className="border-zinc-800 bg-zinc-950 text-zinc-50">
          <CardHeader className="pb-3 border-b border-zinc-800/60">
            <CardTitle className="font-mono text-xs uppercase tracking-wider text-zinc-400">RAG Context Files</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <label className="block rounded-lg border border-dashed border-zinc-800 p-3 text-center cursor-pointer hover:bg-zinc-900/20">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Load File Context</span>
              <input
                type="file"
                onChange={(e) => void handleUploadContextFile(e)}
                className="hidden"
              />
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {files.map((file) => (
                <div key={file.id} className="rounded border border-zinc-850 p-2.5 flex items-center justify-between gap-2 bg-zinc-900/10">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
                    <div className="font-mono text-[10px] text-zinc-200 truncate">{file.original_name}</div>
                  </div>
                  <button
                    onClick={() => void handleDeleteFile(file.id)}
                    className="text-zinc-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* CHAT VIEW WORKSPACE */}
      <section className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-50 overflow-hidden min-h-[560px]">
        {/* WORKSPACE HEADER */}
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/20 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-white">
              {activeSession ? activeSession.title : "SELECT A WORKSPACE CONSOLE"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 font-mono">
              {activeSession ? `Active UUID: ${activeSession.id}` : "Configure active debugger context sessions."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              {messages.length} exchanges
            </span>
          </div>
        </div>

        {/* MESSAGE HISTORY PANEL */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-6 space-y-6 max-h-[calc(100vh-28rem)] min-h-[360px]"
        >
          {messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-lg border p-4 max-w-[88%] leading-relaxed ${
                message.role === "user"
                  ? "ml-auto border-white/20 bg-zinc-900/30 text-zinc-100"
                  : "mr-auto border-zinc-800 bg-zinc-950 text-zinc-300"
              }`}
            >
              <div className="mb-2 flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-900 pb-1.5">
                <span>{message.role}</span>
                <span>#{message.sequence_number}</span>
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>

              {/* Referenced sources */}
              {message.role === "assistant" && message.referenced_files && message.referenced_files.length > 0 && (
                <div className="mt-4 pt-3 border-t border-zinc-900 space-y-1.5">
                  <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                    <Terminal className="h-3 w-3" /> Chunks Context Reference
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {message.referenced_files.map((fileId, idx) => (
                      <span
                        key={idx}
                        className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[9px] text-zinc-400 uppercase"
                      >
                        Source_Chunk_{idx + 1} (Ref: {fileId.slice(0, 8)})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
          {!messages.length && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-600">
              <HelpCircle className="h-8 w-8 mb-2 stroke-1" />
              <p className="text-xs font-mono uppercase tracking-wider">
                WORKSPACE IDLE. INPUT DEBUG QUERIES TO INITIATE THE SEMANTIC RAG PIPELINE.
              </p>
            </div>
          )}
        </div>

        {/* INPUT PROMPT CONTROL BAR */}
        <div className="border-t border-zinc-800/60 p-4 bg-zinc-950">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendPrompt();
                }
              }}
              rows={3}
              placeholder="Query task execution logic or source code vector indices..."
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 font-mono"
            />
            <div className="mt-3 flex items-center justify-between border-t border-zinc-900 pt-3">
              <div className="text-[10px] font-mono text-zinc-600">
                [SSE FEED]: POST /sessions/{"{id}"}/messages/stream
              </div>
              <div className="flex items-center gap-2">
                {streaming && (
                  <button
                    onClick={() => void handleCancelStream()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-950/10 px-3 py-2 text-xs font-mono uppercase tracking-wider text-rose-300 transition hover:bg-rose-950/30"
                  >
                    <StopCircle className="h-3.5 w-3.5 animate-pulse" /> Halt Inference
                  </button>
                )}
                <button
                  disabled={!activeSessionId || !promptDraft.trim() || streaming}
                  onClick={() => void handleSendPrompt()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-mono font-semibold uppercase tracking-wider text-black transition hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" /> Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
