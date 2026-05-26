/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";

export default function Header({
  userEmail,
  onLogout,
  createSession,
  refreshAll,
  isLoading,
  rateLimitInfo,
  rateLimitCountdown,
  wsStatus,
}: any) {
  return (
    <header className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-2xl shadow-cyan-950/10 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Queuely</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Queues, real-time events, and direct tasks</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">A recruiter-facing surface over the FastAPI + Celery + Redis + Postgres stack.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => refreshAll()}
            disabled={isLoading}
            className="h-11 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-60"
          >
            Refresh
          </button>
          <button
            onClick={() => createSession()}
            disabled={isLoading}
            className="h-11 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            Add task
          </button>
          <div className="ml-1 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-zinc-300">WS: {wsStatus}</span>
              {userEmail ? <span className="text-zinc-400">• {userEmail}</span> : null}
            </div>
          </div>
          {userEmail ? (
            <button onClick={() => onLogout?.()} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-zinc-200 transition hover:bg-black/40">
              Logout
            </button>
          ) : null}
        </div>
      </div>

      {rateLimitInfo ? (
        <div className="mt-2 text-[12px] text-zinc-400">
          Rate limit: {rateLimitInfo.remaining ?? "?"}/{rateLimitInfo.limit ?? "?"} reset in {rateLimitCountdown ?? "?"}s
        </div>
      ) : null}
    </header>
  );
}
