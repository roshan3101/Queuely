"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearTokens, readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";

export default function NewSessionPage() {
  const router = useRouter();
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  async function createSession() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await dashboardApi.createSession(tokenState, setTokenState, title.trim());
      router.replace(`/sessions/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="New session" subtitle="Create a dedicated debug session" onSignOut={clearTokens}>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Create a session</CardTitle>
          <CardDescription>Give the session a title, then start chatting inside it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Session title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Investigate queue retry spike" />
          </div>
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button onClick={() => void createSession()} disabled={!ready || !title.trim() || busy}>{busy ? "Creating..." : "Create session"}</Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
