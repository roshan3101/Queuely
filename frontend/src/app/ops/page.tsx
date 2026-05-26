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
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-zinc-400 transition hover:border-white hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Force Refresh
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-950 text-zinc-50">
          <CardHeader className="border-b border-zinc-800/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Broker Queues</CardTitle>
            <CardDescription className="text-zinc-500">Transient task count inside Redis queue lists.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {queues.map((queue) => (
              <div key={queue.name} className="flex items-center justify-between rounded-lg border border-zinc-850 bg-zinc-900/10 px-4 py-3">
                <span className="font-mono text-sm text-zinc-200">{queue.name}</span>
                <span className={`font-mono text-xs border border-zinc-800 px-2 py-0.5 rounded font-semibold ${queue.depth > 0 ? "bg-white text-black" : "bg-transparent text-zinc-500"}`}>
                  {queue.depth}
                </span>
              </div>
            ))}
            {!queues.length && (
              <div className="text-center py-4 text-xs font-mono text-zinc-600">NO ACTIVE QUEUES DETECTED.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950 text-zinc-50">
          <CardHeader className="border-b border-zinc-800/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Celery Cluster Health</CardTitle>
            <CardDescription className="text-zinc-500">Stethoscope telemetry of running worker nodes.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {workers.map((worker) => (
              <div key={`${worker.worker_name}-${worker.process_id}`} className="flex items-center justify-between rounded-lg border border-zinc-850 bg-zinc-900/10 px-4 py-3">
                <div>
                  <div className="font-mono text-sm font-semibold text-white">{worker.worker_name}</div>
                  <div className="font-mono text-[10px] text-zinc-500">{worker.queue_name} • PID {worker.process_id}</div>
                </div>
                <span className={`font-mono text-[10px] uppercase border px-2 py-0.5 rounded ${worker.healthy ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-rose-500/20 text-rose-400 bg-rose-500/5"}`}>
                  {worker.healthy ? "online" : "stale"}
                </span>
              </div>
            ))}
            {!workers.length && (
              <div className="text-center py-4 text-xs font-mono text-zinc-600">NO WORKERS REPORTING HEARTBEATS.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950 text-zinc-50 xl:col-span-2">
          <CardHeader className="border-b border-zinc-800/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Dead-Letter Queue (DLQ)</CardTitle>
            <CardDescription className="text-zinc-500">Failed tasks stored durably in Postgres for operator recovery.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader className="border-zinc-800 hover:bg-transparent">
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Type</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">UUID</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Queue</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Terminal Log</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deadLetters.map((job) => (
                  <TableRow key={job.id} className="border-zinc-850 hover:bg-zinc-900/30">
                    <TableCell className="font-semibold text-white font-mono text-sm">{job.job_type}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">{job.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">{job.queue_name}</TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs text-rose-300">{job.error_message ?? "No log reported"}</TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => void handleRequeueJob(job.id)}
                        disabled={requeueingId === job.id}
                        className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-mono uppercase tracking-wider text-zinc-300 transition hover:border-white hover:bg-white hover:text-black disabled:opacity-40"
                      >
                        <Play className="h-3 w-3" /> {requeueingId === job.id ? "Requeueing..." : "Requeue"}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!deadLetters.length && (
              <div className="text-center py-8 text-xs font-mono text-zinc-600 border border-dashed border-zinc-800 rounded-lg mt-4">
                NO DEAD-LETTERED TASKS RECORDED.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950 text-zinc-50 xl:col-span-2">
          <CardHeader className="border-b border-zinc-800/60">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">API Rate Limits</CardTitle>
            <CardDescription className="text-zinc-500">Persistent user token buckets tracking consumption ceilings.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader className="border-zinc-800 hover:bg-transparent">
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Bucket Identifier</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Available Balance</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Total Capacity</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Refill Constant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateLimits.map((bucket) => (
                  <TableRow key={`${bucket.user_id}-${bucket.bucket_name}`} className="border-zinc-850 hover:bg-zinc-900/30">
                    <TableCell className="font-semibold text-white font-mono text-sm">{bucket.bucket_name}</TableCell>
                    <TableCell className="font-mono text-sm">{Math.round(bucket.tokens)}</TableCell>
                    <TableCell className="font-mono text-sm text-zinc-400">{bucket.capacity}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">+{bucket.refill_rate} tokens / sec</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!rateLimits.length && (
              <div className="text-center py-4 text-xs font-mono text-zinc-600">NO RATE BUCKETS DEFINED yet.</div>
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
