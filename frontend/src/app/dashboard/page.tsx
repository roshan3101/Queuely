"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CircleAlert, Database, FileText, Gauge, RefreshCcw, ServerCog, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { FileRecord, JobRecord, QueueDepth, RateLimitBucketRecord, WorkerRecord } from "@/lib/dashboard-types";

function MiniBars({ values, tone }: { values: number[]; tone: "cyan" | "emerald" | "amber" | "rose" }) {
  const max = Math.max(...values, 1);
  const toneClass = {
    cyan: "bg-cyan-400",
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
  }[tone];

  return (
    <div className="mt-4 flex h-24 items-end gap-2">
      {values.map((value, index) => (
        <div key={`${index}-${value}`} className="flex flex-1 items-end">
          <div className="flex w-full flex-col items-center gap-2">
            <div className="w-full rounded-full bg-white/8 p-1">
              <div className={`rounded-full ${toneClass}`} style={{ height: `${Math.max(8, (value / max) * 88)}px` }} />
            </div>
            <span className="text-[11px] text-zinc-500">{value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <Card className="bg-linear-to-br from-white/8 to-transparent">
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm text-zinc-400">
        <span>{detail}</span>
        <Icon className="h-4 w-4 text-cyan-300" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [deadLetters, setDeadLetters] = useState<JobRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitBucketRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;

    void Promise.all([
      dashboardApi.listJobs(tokenState, setTokenState).then((data) => setJobs(data.items)).catch(() => void 0),
      dashboardApi.listDeadLetters(tokenState, setTokenState).then((data) => setDeadLetters(data.items)).catch(() => void 0),
      dashboardApi.listFiles(tokenState, setTokenState).then((data) => setFiles(data.items)).catch(() => void 0),
      dashboardApi.listQueues(tokenState, setTokenState).then((data) => setQueues(data.queues)).catch(() => void 0),
      dashboardApi.listWorkers(tokenState, setTokenState).then((data) => setWorkers(data.workers)).catch(() => void 0),
      dashboardApi.listRateLimits(tokenState, setTokenState).then((data) => setRateLimits(data.items)).catch(() => void 0),
    ]);
  }, [ready, tokenState]);

  const launchedTasks = useMemo(() => jobs.length, [jobs]);
  const activeJobs = useMemo(() => jobs.filter((job) => job.status === "running" || job.status === "queued").length, [jobs]);
  const succeededJobs = useMemo(() => jobs.filter((job) => job.status === "succeeded").length, [jobs]);
  const failedJobs = useMemo(() => jobs.filter((job) => job.status === "failed" || job.status === "dead_lettered").length, [jobs]);
  const readyFiles = useMemo(() => files.filter((file) => file.status === "ready").length, [files]);
  const healthyWorkers = useMemo(() => workers.filter((worker) => worker.healthy).length, [workers]);
  const queueDepthTotal = useMemo(() => queues.reduce((sum, queue) => sum + queue.depth, 0), [queues]);
  const queuePeak = useMemo(() => queues.reduce((max, queue) => Math.max(max, queue.depth), 0), [queues]);
  const rateLimitUtilization = useMemo(() => {
    if (!rateLimits.length) return 0;
    const average = rateLimits.reduce((sum, bucket) => sum + bucket.tokens / Math.max(bucket.capacity, 1), 0) / rateLimits.length;
    return Math.round(average * 100);
  }, [rateLimits]);

  return (
    <>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tasks launched" value={launchedTasks} detail="Direct uploads and processing runs" icon={Workflow} />
        <MetricCard label="Jobs active" value={activeJobs} detail="Queued or running tasks" icon={Workflow} />
        <MetricCard label="Files ready" value={readyFiles} detail="Indexed uploads available for retrieval" icon={FileText} />
        <MetricCard label="Healthy workers" value={`${healthyWorkers}/${workers.length || 0}`} detail="Celery workers reporting heartbeats" icon={ServerCog} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Jump into the main workflows from one place.</CardDescription>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/ops">Open ops <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="secondary" className="justify-start"><Link href="/tasks/new">Add task <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="secondary" className="justify-start"><Link href="/jobs">Open jobs <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="secondary" className="justify-start"><Link href="/files">Manage files <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="secondary" className="justify-start"><Link href="/tasks/new">Review output <ArrowRight className="h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health snapshot</CardTitle>
            <CardDescription>Worker and rate-limit status at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-300">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><span className="flex items-center gap-2 text-zinc-200"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Healthy workers</span><Badge variant="success">{healthyWorkers}/{workers.length || 0}</Badge></div>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><span className="flex items-center gap-2 text-zinc-200"><Gauge className="h-4 w-4 text-cyan-300" /> Rate-limit utilization</span><Badge variant="secondary">{rateLimitUtilization}%</Badge></div>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><span className="flex items-center gap-2 text-zinc-200"><CircleAlert className="h-4 w-4 text-rose-300" /> Dead letters</span><Badge variant={deadLetters.length ? "destructive" : "secondary"}>{deadLetters.length}</Badge></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Queue pressure</CardTitle>
            <CardDescription>Total queue depth and the busiest queues.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Total depth</div><div className="mt-1 text-2xl font-semibold text-white">{queueDepthTotal}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Queues</div><div className="mt-1 text-2xl font-semibold text-white">{queues.length}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Peak depth</div><div className="mt-1 text-2xl font-semibold text-white">{queuePeak}</div></div>
            </div>
            <MiniBars values={queues.slice(0, 8).map((queue) => queue.depth)} tone="cyan" />
            <div className="mt-4 space-y-2">
              {queues.slice(0, 6).map((queue) => <div key={queue.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm"><span className="text-zinc-200">{queue.name}</span><Badge variant={queue.depth > 0 ? "secondary" : "outline"}>{queue.depth}</Badge></div>)}
              {!queues.length ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No queues reported yet.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Worker health</CardTitle>
            <CardDescription>Heartbeat and activity for the active workers.</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniBars values={workers.slice(0, 8).map((worker) => worker.active_jobs)} tone="emerald" />
            <div className="mt-4 space-y-2">
              {workers.slice(0, 6).map((worker) => <div key={`${worker.worker_name}-${worker.process_id}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm"><div className="min-w-0"><div className="truncate text-white">{worker.worker_name}</div><div className="text-xs text-zinc-500">{worker.queue_name} • {worker.hostname}</div></div><Badge variant={worker.healthy ? "success" : "destructive"}>{worker.healthy ? "healthy" : "stale"}</Badge></div>)}
              {!workers.length ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No workers returned yet.</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dead letters</CardTitle>
            <CardDescription>Failed jobs that may need inspection or requeueing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {deadLetters.slice(0, 6).map((job) => <div key={job.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-white">{job.job_type}</span><Badge variant="destructive">{job.status}</Badge></div><div className="mt-1 text-xs text-zinc-500">{job.queue_name} • {new Date(job.updated_at).toLocaleString()}</div><div className="mt-2 truncate text-sm text-zinc-300">{job.error_message ?? "No error message recorded"}</div></div>)}
            {!deadLetters.length ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No dead letters in the current window.</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest results</CardTitle>
            <CardDescription>Finished jobs that already produced output.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.filter((job) => job.result).slice(0, 5).map((job) => <div key={job.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-white">{job.job_type}</span><Badge variant="secondary">{job.status}</Badge></div><div className="mt-1 text-xs text-zinc-500">{new Date(job.updated_at).toLocaleString()}</div><div className="mt-2 max-h-28 overflow-auto rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-zinc-300">{JSON.stringify(job.result, null, 2)}</div></div>)}
            {!jobs.some((job) => job.result) ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No completed results yet.</div> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card><CardHeader className="pb-3"><CardDescription>Files</CardDescription><CardTitle>{files.length}</CardTitle></CardHeader><CardContent className="flex items-center justify-between text-sm text-zinc-400"><span>Indexed uploads</span><FileText className="h-4 w-4 text-amber-200" /></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardDescription>Succeeded jobs</CardDescription><CardTitle>{succeededJobs}</CardTitle></CardHeader><CardContent className="flex items-center justify-between text-sm text-zinc-400"><span>Completed tasks</span><RefreshCcw className="h-4 w-4 text-emerald-300" /></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardDescription>Failed jobs</CardDescription><CardTitle>{failedJobs}</CardTitle></CardHeader><CardContent className="flex items-center justify-between text-sm text-zinc-400"><span>Retry candidates</span><Database className="h-4 w-4 text-rose-300" /></CardContent></Card>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
    </>
  );
}