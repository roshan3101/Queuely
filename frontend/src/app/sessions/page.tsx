"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearTokens, readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { SessionRecord } from "@/lib/dashboard-types";

export default function SessionsPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;
    dashboardApi.listSessions(tokenState, setTokenState).then((data) => setSessions(data.items)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load sessions"));
  }, [ready, tokenState]);

  return (
    <AppShell title="Sessions" subtitle="Create and inspect AI debug sessions" onSignOut={clearTokens}>
      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Session list</CardTitle>
            <CardDescription>Each session has its own chat history and retrieval context.</CardDescription>
          </div>
          <Button asChild className="w-fit"><Link href="/sessions/new">New session</Link></Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium text-white">{session.title}</TableCell>
                  <TableCell><Badge variant="secondary">{session.status}</Badge></TableCell>
                  <TableCell>{session.model_name ?? "default"}</TableCell>
                  <TableCell>{new Date(session.updated_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right"><Link href={`/sessions/${session.id}`} className="text-cyan-200 hover:text-cyan-100">Open</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!sessions.length ? <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No sessions found yet.</div> : null}
          {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}
