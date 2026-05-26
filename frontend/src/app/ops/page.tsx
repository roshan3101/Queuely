"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { JobRecord, QueueDepth, RateLimitBucketRecord, WorkerRecord } from "@/lib/dashboard-types";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, Play } from "lucide-react";

export default function OpsPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [deadLetters, setDeadLetters] = useState<JobRecord[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitBucketRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requeueingId, setRequeueingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  const loadOpsData = () => {
    if (!ready || !tokenState.accessToken) return;
    void Promise.all([
      dashboardApi.listQueues(tokenState, setTokenState).then((data) => setQueues(data.queues)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load queues")),
      dashboardApi.listWorkers(tokenState, setTokenState).then((data) => setWorkers(data.workers)).catch(() => void 0),
      dashboardApi.listDeadLetters(tokenState, setTokenState).then((data) => setDeadLetters(data.items)).catch(() => void 0),
      dashboardApi.listRateLimits(tokenState, setTokenState).then((data) => setRateLimits(data.items)).catch(() => void 0),
    ]);
  };

  useEffect(() => {
    loadOpsData();
  }, [ready, tokenState]);

  const handleRequeueJob = async (jobId: string) => {
    if (requeueingId) return;
    setRequeueingId(jobId);
    try {
      await dashboardApi.requeueJob(tokenState, setTokenState, jobId);
      toast({ title: "Job Requeued", description: `Task run ${jobId.slice(0, 8)} sent back to queue.`, variant: "success" });
      loadOpsData();
    } catch (e) {
      toast({ title: "Requeue failed", description: e instanceof Error ? e.message : "An error occurred.", variant: "error" });
    } finally {
      setRequeueingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold font-mono tracking-tight uppercase">Operations Dashboard</h1>
        <button
          onClick={loadOpsData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Force Refresh
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border bg-card text-foreground shadow-sm">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Broker Queues</CardTitle>
            <CardDescription className="text-muted-foreground">Transient task count inside Redis queue lists.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {queues.map((queue) => (
              <div key={queue.name} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <span className="font-mono text-sm text-foreground">{queue.name}</span>
                <span className={`font-mono text-xs border border-border px-2 py-0.5 rounded font-semibold ${queue.depth > 0 ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}>
                  {queue.depth}
                </span>
              </div>
            ))}
            {!queues.length && (
              <div className="text-center py-4 text-xs font-mono text-muted-foreground">NO ACTIVE QUEUES DETECTED.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-foreground shadow-sm">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Celery Cluster Health</CardTitle>
            <CardDescription className="text-muted-foreground">Stethoscope telemetry of running worker nodes.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {workers.map((worker) => (
              <div key={`${worker.worker_name}-${worker.process_id}`} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div>
                  <div className="font-mono text-sm font-semibold text-foreground">{worker.worker_name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{worker.queue_name} • PID {worker.process_id}</div>
                </div>
                <span className={`font-mono text-[10px] uppercase border px-2 py-0.5 rounded ${worker.healthy ? "border-emerald-500/20 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/5" : "border-rose-500/20 text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/5"}`}>
                  {worker.healthy ? "online" : "stale"}
                </span>
              </div>
            ))}
            {!workers.length && (
              <div className="text-center py-4 text-xs font-mono text-muted-foreground">NO WORKERS REPORTING HEARTBEATS.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-foreground shadow-sm xl:col-span-2">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Dead-Letter Queue (DLQ)</CardTitle>
            <CardDescription className="text-muted-foreground">Failed tasks stored durably in Postgres for operator recovery.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader className="border-border hover:bg-transparent">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Type</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">UUID</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Queue</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Terminal Log</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deadLetters.map((job) => (
                  <TableRow key={job.id} className="border-border hover:bg-muted/40">
                    <TableCell className="font-semibold text-foreground font-mono text-sm">{job.job_type}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{job.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{job.queue_name}</TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs text-rose-700 dark:text-rose-300">{job.error_message ?? "No log reported"}</TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => void handleRequeueJob(job.id)}
                        disabled={requeueingId === job.id}
                        className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1 text-xs font-mono uppercase tracking-wider text-foreground transition hover:bg-muted disabled:opacity-40"
                      >
                        <Play className="h-3 w-3" /> {requeueingId === job.id ? "Requeueing..." : "Requeue"}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!deadLetters.length && (
              <div className="text-center py-8 text-xs font-mono text-muted-foreground border border-dashed border-border rounded-lg mt-4">
                NO DEAD-LETTERED TASKS RECORDED.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-foreground shadow-sm xl:col-span-2">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">API Rate Limits</CardTitle>
            <CardDescription className="text-muted-foreground">Persistent user token buckets tracking consumption ceilings.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader className="border-border hover:bg-transparent">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Bucket Identifier</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Available Balance</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Total Capacity</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Refill Constant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateLimits.map((bucket) => (
                  <TableRow key={`${bucket.user_id}-${bucket.bucket_name}`} className="border-border hover:bg-muted/40">
                    <TableCell className="font-semibold text-foreground font-mono text-sm">{bucket.bucket_name}</TableCell>
                    <TableCell className="font-mono text-sm">{Math.round(bucket.tokens)}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{bucket.capacity}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">+{bucket.refill_rate} tokens / sec</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!rateLimits.length && (
              <div className="text-center py-4 text-xs font-mono text-muted-foreground">NO RATE BUCKETS DEFINED yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 px-4 py-3 text-sm font-mono text-rose-200">
          [SYSTEM CRITICAL]: {error}
        </div>
      ) : null}
    </div>
  );
}
