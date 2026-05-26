"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Gauge, ServerCog, ShieldCheck, Workflow, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { FileRecord, JobRecord, QueueDepth, RateLimitBucketRecord, WorkerRecord } from "@/lib/dashboard-types";

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <Card className="border-border bg-card text-foreground">
      <CardHeader className="pb-2">
        <CardDescription className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">{label}</CardDescription>
        <CardTitle className="text-2xl font-bold font-mono tracking-tight text-foreground">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-xs font-mono text-zinc-500 pt-0">
        <span>{detail}</span>
        <Icon className="h-4 w-4 text-zinc-400 dark:text-zinc-650" />
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
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-xl font-bold font-mono tracking-tight uppercase text-foreground">Console Overview</h1>
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">[SYSTEM STABLE]</span>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tasks Launched" value={launchedTasks} detail="Direct uploads and task runs" icon={Workflow} />
        <MetricCard label="Jobs Active" value={activeJobs} detail="Queued or running tasks" icon={Workflow} />
        <MetricCard label="Files Context Indexed" value={readyFiles} detail="Source files for AI vector retrieval" icon={FileText} />
        <MetricCard label="Cluster Workers" value={`${healthyWorkers}/${workers.length || 0}`} detail="Celery heartbeats reporting nominal" icon={ServerCog} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border bg-card">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-4 border-b border-border/40">
            <div>
              <CardTitle>Launch Console Actions</CardTitle>
              <CardDescription>Initiate queue operations or manage indexed memory.</CardDescription>
            </div>
            <Button variant="secondary" className="border border-border text-xs font-mono uppercase bg-card text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900" asChild>
              <Link href="/ops">Launch Ops <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 pt-6">
            <Button asChild variant="secondary" className="justify-between border border-border bg-card text-foreground text-xs font-mono uppercase hover:bg-zinc-50 dark:hover:bg-zinc-900/50"><Link href="/tasks/new">Add Blueprint Task <PlusIcon /></Link></Button>
            <Button asChild variant="secondary" className="justify-between border border-border bg-card text-foreground text-xs font-mono uppercase hover:bg-zinc-50 dark:hover:bg-zinc-900/50"><Link href="/jobs">View Active Feeds <PlusIcon /></Link></Button>
            <Button asChild variant="secondary" className="justify-between border border-border bg-card text-foreground text-xs font-mono uppercase hover:bg-zinc-50 dark:hover:bg-zinc-900/50"><Link href="/files">Index Context Files <PlusIcon /></Link></Button>
            <Button asChild variant="secondary" className="justify-between border border-border bg-card text-foreground text-xs font-mono uppercase hover:bg-zinc-50 dark:hover:bg-zinc-900/50"><Link href="/sessions">AI Debug Conversations <PlusIcon /></Link></Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-4 border-b border-border/40">
            <CardTitle>Telemetry Snapshot</CardTitle>
            <CardDescription>Live health and allocation quotas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs font-mono text-zinc-500 pt-6">
            <div className="flex items-center justify-between rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-2.5">
              <span className="flex items-center gap-2 text-foreground font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> WORKER STATUS</span>
              <span className="text-foreground">{healthyWorkers}/{workers.length || 0} active</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-2.5">
              <span className="flex items-center gap-2 text-foreground font-semibold"><Gauge className="h-3.5 w-3.5" /> RATE QUOTA SPENT</span>
              <span className="text-foreground">{rateLimitUtilization}%</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-2.5">
              <span className="flex items-center gap-2 text-foreground font-semibold"><CircleAlert className="h-3.5 w-3.5 text-zinc-400" /> DEAD LETTERS</span>
              <span className="text-foreground">{deadLetters.length} jobs</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-4 border-b border-border/40">
            <CardTitle>Broker Queues</CardTitle>
            <CardDescription>Current Redis backlog and peaks.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 p-3">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Total depth</div>
                <div className="mt-1 text-xl font-bold font-mono text-foreground">{queueDepthTotal}</div>
              </div>
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 p-3">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Queues</div>
                <div className="mt-1 text-xl font-bold font-mono text-foreground">{queues.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 p-3">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Peak depth</div>
                <div className="mt-1 text-xl font-bold font-mono text-foreground">{queuePeak}</div>
              </div>
            </div>
            <div className="space-y-2">
              {queues.slice(0, 4).map((queue) => (
                <div key={queue.name} className="flex items-center justify-between rounded-lg border border-border bg-zinc-50/50 dark:bg-zinc-900/10 px-4 py-2.5 text-xs font-mono">
                  <span className="text-zinc-500">{queue.name}</span>
                  <span className="text-foreground font-semibold">{queue.depth}</span>
                </div>
              ))}
              {!queues.length && <div className="text-center py-4 text-xs font-mono text-zinc-400">No queues active.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-4 border-b border-border/40">
            <CardTitle>Dead-Lettered Log</CardTitle>
            <CardDescription>Terminal failures requiring manual actions.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            {deadLetters.slice(0, 3).map((job) => (
              <div key={job.id} className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 p-3.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{job.job_type}</span>
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-zinc-200 dark:border-zinc-800 rounded bg-card text-zinc-500">FAILED</span>
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">ID: {job.id.slice(0, 8)} • {new Date(job.updated_at).toLocaleDateString()}</div>
                <div className="mt-2 text-zinc-400 font-mono line-clamp-1">{job.error_message ?? "No error log reported"}</div>
              </div>
            ))}
            {!deadLetters.length && <div className="text-center py-8 text-xs font-mono text-zinc-400">Zero dead letter entries recorded.</div>}
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 px-4 py-3 text-xs font-mono text-rose-300">
          [CRITICAL ERROR]: {error}
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}