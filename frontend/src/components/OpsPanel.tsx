/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React from "react";
import { shortId } from "../lib/uiHelpers";

export default function OpsPanel({ queues, workers, deadLetters, opsJobs, requeueJob, loadJobDetail, opsJobsOffset, prevOpsPage, nextOpsPage, opsBusy }: any) {
  return (
    <aside className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-300">Operations</h2>
          <p className="mt-1 text-xs text-zinc-500">Queue health, workers, and dead letters</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Queue depths</h3>
            <span className="text-xs text-zinc-500">{queues.length} queues</span>
          </div>
          <div className="mt-3 space-y-2">
            {queues.map((queue:any) => (
              <div key={queue.name} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-200">{queue.name}</span>
                  <span className="font-mono text-cyan-200">{queue.depth}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-linear-to-r from-cyan-400 to-sky-500" style={{ width: `${Math.min(100, queue.depth * 12)}%` }} />
                </div>
              </div>
            ))}
            {!queues.length ? <p className="text-sm text-zinc-500">No queue data loaded.</p> : null}
          </div>
        </section>

        <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Workers</h3>
            <span className="text-xs text-zinc-500">{workers.length} tracked</span>
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
            {workers.map((worker:any) => (
              <div key={`${worker.worker_name}-${worker.process_id}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-white">{worker.worker_name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${worker.healthy ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>{worker.healthy ? "healthy" : "stale"}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">{worker.queue_name} | {worker.hostname} | pid {worker.process_id}</div>
                <div className="mt-1 text-xs text-zinc-400">{worker.active_jobs} active jobs</div>
              </div>
            ))}
            {!workers.length ? <p className="text-sm text-zinc-500">No worker heartbeats yet.</p> : null}
          </div>
        </section>

        <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Jobs</h3>
            <button className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition hover:bg-black/30">Refresh</button>
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
            {opsJobs.map((job:any) => (
              <button key={job.id} onClick={()=>loadJobDetail(job.id)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-white">{job.job_type}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{job.status}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500"><span className="truncate">{job.queue_name}</span><span className="font-mono">{shortId(job.id)}</span></div>
                <div className="mt-1 text-xs text-zinc-400 max-h-12 overflow-hidden">{job.error_message ? job.error_message : JSON.stringify(job.result ?? {})}</div>
              </button>
            ))}
            {!opsJobs.length ? <p className="text-sm text-zinc-500">No jobs loaded.</p> : null}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-zinc-400">Showing {opsJobs.length} jobs</div>
            <div className="flex gap-2">
              <button onClick={()=>prevOpsPage()} disabled={opsJobsOffset<=0} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-200">Prev</button>
              <button onClick={()=>nextOpsPage()} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-200">Next</button>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Dead letters</h3>
            <span className="text-xs text-zinc-500">{deadLetters.length} items</span>
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
            {deadLetters.map((job:any) => (
              <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-white">{job.job_type}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{job.status}</span>
                </div>
                <div className="mt-1 max-h-10 overflow-hidden text-xs text-zinc-400">{job.error_message ?? "No error message."}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-zinc-500">{shortId(job.id)}</span>
                  <button disabled={opsBusy} onClick={()=>requeueJob(job.id)} className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40">Requeue</button>
                </div>
              </div>
            ))}
            {!deadLetters.length ? <p className="text-sm text-zinc-500">No dead letters loaded.</p> : null}
          </div>
        </section>
      </div>
    </aside>
  );
}
