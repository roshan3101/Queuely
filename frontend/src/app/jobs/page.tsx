"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { JobRecord } from "@/lib/dashboard-types";

export default function JobsPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;
    dashboardApi.listJobs(tokenState, setTokenState).then((data) => setJobs(data.items)).catch((e) => setError(e instanceof Error ? e.message : "Failed to load jobs"));
  }, [ready, tokenState]);

  return (
    <Card>
        <CardHeader>
          <CardTitle>Job feed</CardTitle>
          <CardDescription>View the latest jobs submitted to Celery and the backend retry flow.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium text-white">{job.job_type}</TableCell>
                  <TableCell><Badge variant={job.status === "dead_lettered" ? "destructive" : "secondary"}>{job.status}</Badge></TableCell>
                  <TableCell>{job.queue_name}</TableCell>
                  <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                  <TableCell className="max-w-[420px] truncate text-zinc-400">{JSON.stringify(job.payload)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!jobs.length ? <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No jobs loaded yet.</div> : null}
          {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </CardContent>
      </Card>
  );
}
