/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useEffect, useState } from "react";
import { shortId } from "../lib/uiHelpers";

export default function Header({
  apiBase,
  setApiBase,
  token,
  setToken,
  createSession,
  refreshAll,
  isLoading,
  rateLimitInfo,
  rateLimitCountdown,
  wsStatus,
  wsReconnectAttempt,
  lastPingAt,
  isOnline,
  lastSyncAt,
  onResync,
}: any) {
  return (
    <header className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-2xl shadow-cyan-950/10 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Queuely</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Debug sessions, retrieval, and ops in one surface</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">Session memory, codebase context, streaming assistant replies, and queue operations are wired against the backend.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">API Base</span>
            <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600" />
          </label>
          <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">JWT</span>
            <input value={token} onChange={(e) => setToken(e.target.value)} className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600" placeholder="Bearer token" />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={() => refreshAll()} className="h-11 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20">Refresh</button>
            <button onClick={() => createSession()} className="h-11 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">New session</button>
          </div>
        </div>
      </div>

      {rateLimitInfo ? (
        <div className="mt-2 text-[12px] text-zinc-400">Rate limit: {rateLimitInfo.remaining ?? "?"}/{rateLimitInfo.limit ?? "?"} reset in {rateLimitCountdown ?? "?"}s</div>
      ) : null}
    </header>
  );
}
