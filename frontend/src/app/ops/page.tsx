"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearTokens, readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { JobRecord, QueueDepth, RateLimitBucketRecord, WorkerRecord } from "@/lib/dashboard-types";

export default function OpsPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [deadLetters, setDeadLetters] = useState<JobRecord[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitBucketRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;
    void Promise.all([
      dashboardApi.listQueues(tokenState, setTokenState).then((data) => setQueues(data.queues)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load queues")),
      dashboardApi.listWorkers(tokenState, setTokenState).then((data) => setWorkers(data.workers)).catch(() => void 0),
      dashboardApi.listDeadLetters(tokenState, setTokenState).then((data) => setDeadLetters(data.items)).catch(() => void 0),
      dashboardApi.listRateLimits(tokenState, setTokenState).then((data) => setRateLimits(data.items)).catch(() => void 0),
    ]);
  }, [ready, tokenState]);

  return (
    <AppShell title="Ops" subtitle="Queues, workers, dead letters, and rate limits" onSignOut={clearTokens}>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Queue depths</CardTitle>
            <CardDescription>Redis queue lengths reported by the API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {queues.map((queue) => (
              <div key={queue.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-zinc-200">{queue.name}</span>
                <Badge variant="secondary">{queue.depth}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workers</CardTitle>
            <CardDescription>Heartbeat and health view for active workers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {workers.map((worker) => (
              <div key={`${worker.worker_name}-${worker.process_id}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div>
                  <div className="text-white">{worker.worker_name}</div>
                  <div className="text-xs text-zinc-500">{worker.queue_name} • {worker.hostname}</div>
                </div>
                <Badge variant={worker.healthy ? "success" : "destructive"}>{worker.healthy ? "healthy" : "stale"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dead letters</CardTitle>
            <CardDescription>Jobs that failed and need manual requeue or inspection.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queue</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deadLetters.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium text-white">{job.job_type}</TableCell>
                    <TableCell><Badge variant="destructive">{job.status}</Badge></TableCell>
                    <TableCell>{job.queue_name}</TableCell>
                    <TableCell className="max-w-70 truncate text-zinc-400">{job.error_message ?? "Unknown error"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rate limits</CardTitle>
            <CardDescription>Current token buckets returned by the backend.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bucket</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Refill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateLimits.map((bucket) => (
                  <TableRow key={`${bucket.user_id}-${bucket.bucket_name}`}>
                    <TableCell className="font-medium text-white">{bucket.bucket_name}</TableCell>
                    <TableCell>{bucket.tokens}</TableCell>
                    <TableCell>{bucket.capacity}</TableCell>
                    <TableCell>{bucket.refill_rate}/s</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
    </AppShell>
  );
}
