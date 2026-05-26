/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React from "react";
import { formatBytes } from "../lib/uiHelpers";

export default function SessionSidebar({
  sessions,
  activeSessionId,
  setActiveSessionId,
  sessionTitle,
  setSessionTitle,
  createSession,
  files,
  uploadFile,
  reindexFilePrompt,
  deleteFile,
}: any) {
  return (
    <aside className="rounded-[28px] border border-border bg-card p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-foreground">Tasks</h2>
          <p className="mt-1 text-xs text-muted-foreground">{sessions.length} available</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="rounded-2xl border border-border bg-muted/30 px-3 py-2">
          <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">New title</span>
          <input
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
            placeholder="Design review session"
          />
        </label>
        <button
          onClick={() => createSession()}
          className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-medium text-foreground transition hover:border-cyan-400/30 hover:bg-cyan-50 dark:bg-zinc-900/30 dark:hover:bg-cyan-400/10"
        >
          Add task
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {sessions.map((session: any) => (
          <button
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              session.id === activeSessionId
                ? "border-cyan-400/40 bg-cyan-50 text-foreground dark:bg-cyan-400/10"
                : "border-border bg-card hover:border-border hover:bg-muted dark:bg-zinc-900/30 dark:hover:bg-zinc-900/50"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-medium text-foreground">{session.title}</span>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                {session.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{session.model_name ?? "unbound"}</span>
              <span>{session.id.slice(0, 8)}</span>
            </div>
          </button>
        ))}
        {!sessions.length ? <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No tasks yet.</p> : null}

        <div className="mt-6 rounded-[22px] border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">File context</h3>
              <span className="text-xs text-muted-foreground">{files.length} files</span>
            </div>
          </div>
          <div className="mt-3">
            <input
              type="file"
              onChange={(e: any) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
              }}
              className="block w-full cursor-pointer rounded-xl border border-dashed border-border bg-card px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-950 dark:bg-zinc-900/30"
            />
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
            {files.slice(0, 8).map((file: any) => (
              <div key={file.id} className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-zinc-900/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-foreground">{file.original_name}</span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{file.status}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{file.language ?? "plain text"}</span>
                  <span>{formatBytes(file.size_bytes)}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => reindexFilePrompt(file.id)} className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground transition hover:bg-muted dark:bg-zinc-900/30 dark:hover:bg-zinc-900/50">Reindex</button>
                  <button onClick={() => deleteFile(file.id)} className="rounded-lg border border-rose-500/30 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 transition hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-100 dark:hover:bg-rose-500/20">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
