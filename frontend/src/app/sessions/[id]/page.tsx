"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { clearTokens, readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { MessageRecord, SessionRecord } from "@/lib/dashboard-types";

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;
    dashboardApi.listSessions(tokenState, setTokenState).then((data) => setSession(data.items.find((item) => item.id === sessionId) ?? null)).catch(() => void 0);
    dashboardApi.listMessages(tokenState, setTokenState, sessionId).then((data) => setMessages(data.items)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load messages"));
  }, [ready, tokenState, sessionId]);

  const messageCount = useMemo(() => messages.length, [messages]);

  async function sendMessage() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await dashboardApi.sendMessage(tokenState, setTokenState, sessionId, draft.trim());
      setDraft("");
      setMessages((current) => [...current, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={session?.title ?? "Session"} subtitle="Chat and retrieved context" onSignOut={clearTokens}>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{session?.title ?? "Session detail"}</CardTitle>
            <CardDescription>{messageCount} messages in this conversation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
              {messages.map((message) => (
                <div key={message.id} className={`rounded-2xl border p-4 ${message.role === "user" ? "border-cyan-400/20 bg-cyan-400/10" : "border-white/10 bg-black/20"}`}>
                  <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-zinc-500">
                    <span>{message.role}</span>
                    <span>#{message.sequence_number}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-100">{message.content}</div>
                  {message.referenced_files.length ? <div className="mt-3 flex flex-wrap gap-2">{message.referenced_files.map((fileId) => <Badge key={fileId} variant="secondary">{fileId.slice(0, 8)}</Badge>)}</div> : null}
                </div>
              ))}
              {!messages.length ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No messages yet. Start the conversation on the right.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compose reply</CardTitle>
            <CardDescription>Persist a new message into this session.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about the job pipeline, uploaded files, or output traces..." />
            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => router.back()}>Back</Button>
              <Button onClick={() => void sendMessage()} disabled={!ready || !draft.trim() || busy}>{busy ? "Sending..." : "Send"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
