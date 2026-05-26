"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import { useWebSocket } from "@/lib/useWebSocket";
import type { JobRecord } from "@/lib/dashboard-types";
import { XCircle, CheckCircle2, RotateCw, AlertTriangle, AlertCircle, PlayCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

function JobStatusBadge({ status }: { status: JobRecord["status"] }) {
  const mapping = {
    pending: { label: "pending", icon: PlayCircle, className: "border-border text-muted-foreground bg-muted/40" },
    queued: { label: "queued", icon: RotateCw, className: "border-border text-foreground animate-spin bg-muted/40" },
    running: { label: "running", icon: RotateCw, className: "border-foreground text-foreground animate-spin bg-card" },
    succeeded: { label: "succeeded", icon: CheckCircle2, className: "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" },
    failed: { label: "failed", icon: AlertTriangle, className: "border-rose-500/20 text-rose-400 bg-rose-500/5" },
    retrying: { label: "retrying", icon: RotateCw, className: "border-amber-500/20 text-amber-400 bg-amber-500/5 animate-pulse" },
    dead_lettered: { label: "dead lettered", icon: AlertCircle, className: "border-rose-500/30 text-rose-300 bg-rose-950/20" },
    cancelled: { label: "cancelled", icon: XCircle, className: "border-border text-muted-foreground bg-muted/20" },
  };

  const config = mapping[status as keyof typeof mapping] || { label: status, icon: PlayCircle, className: "border-border text-muted-foreground bg-card" };
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-mono tracking-tight uppercase ${config.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

export default function JobsPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  const loadJobs = () => {
    if (!ready || !tokenState.accessToken) return;
    dashboardApi
      .listJobs(tokenState, setTokenState)
      .then((data) => setJobs(data.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load jobs"));
  };

  useEffect(() => {
    loadJobs();
  }, [ready, tokenState]);

  // Hook up WebSocket for live real-time updates without polling
  const { connected } = useWebSocket((updatedJob) => {
    setJobs((prevJobs) => {
      const idx = prevJobs.findIndex((j) => j.id === updatedJob.id);
      if (idx === -1) {
        return [updatedJob, ...prevJobs];
      }
      const clone = [...prevJobs];
      clone[idx] = updatedJob;
      return clone;
    });
    toast({
      title: `Job ${updatedJob.job_type}`,
      description: `Status changed to ${updatedJob.status}.`,
      variant: updatedJob.status === "dead_lettered" ? "error" : updatedJob.status === "succeeded" ? "success" : "info",
    });
  });

  const handleCancelJob = async (jobId: string) => {
    if (cancellingId) return;
    setCancellingId(jobId);
    try {
      await dashboardApi.cancelJob(tokenState, setTokenState, jobId);
      toast({ title: "Job Cancelled", description: `Task ${jobId.slice(0, 8)} cancellation requested.`, variant: "success" });
      loadJobs();
    } catch (e) {
      toast({ title: "Cancellation failed", description: e instanceof Error ? e.message : "An error occurred.", variant: "error" });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold font-mono tracking-tight uppercase">Job Feed</h1>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
          <span className="text-xs font-mono text-zinc-400">
            {connected ? "LIVE WEBSOCKET ACTIVE" : "DISCONNECTED - STANDBY"}
          </span>
        </div>
      </div>

      <Card className="border-border bg-card text-foreground shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="font-mono text-sm uppercase tracking-wider">Active Stream</CardTitle>
            <CardDescription className="text-muted-foreground">
            Real-time auditable task timeline powered by Postgres and Redis fanout.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Table>
            <TableHeader className="border-border hover:bg-transparent">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Type</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Queue</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Created</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Payload Preview</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id} className="border-border hover:bg-muted/40">
                  <TableCell className="font-semibold text-foreground font-mono text-sm">{job.job_type}</TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{job.queue_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</TableCell>
                  <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                    {JSON.stringify(job.payload)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(job.status === "pending" || job.status === "queued" || job.status === "running") ? (
                      <button
                        onClick={() => void handleCancelJob(job.id)}
                        disabled={cancellingId === job.id}
                        className="rounded border border-border bg-card px-2.5 py-1 text-xs font-mono uppercase tracking-wider text-foreground transition hover:border-rose-500/40 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/20 disabled:opacity-40"
                      >
                        {cancellingId === job.id ? "Cancelling..." : "Cancel"}
                      </button>
                    ) : (
                        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Archive</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!jobs.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm font-mono text-muted-foreground">
              NO ACTIVE JOBS FOUND. SUBMIT A TASK WIZARD TO STREAM LIVE METRICS.
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-50 px-4 py-3 text-sm font-mono text-rose-700 dark:bg-rose-950/10 dark:text-rose-200">
              [SYSTEM ERROR]: {error}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
