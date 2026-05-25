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
    <aside className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-300">Sessions</h2>
          <p className="mt-1 text-xs text-zinc-500">{sessions.length} available</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">New title</span>
          <input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600" placeholder="Design review session" />
        </label>
        <button onClick={() => createSession()} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:border-cyan-400/30 hover:bg-cyan-400/10">Create session</button>
      </div>
      <div className="mt-4 space-y-2">
        {sessions.map((session: any) => (
          <button key={session.id} onClick={() => setActiveSessionId(session.id)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${session.id === activeSessionId ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-medium text-white">{session.title}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] text-zinc-400">{session.status}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{session.model_name ?? "unbound"}</span>
              <span>{session.id.slice(0, 8)}</span>
            </div>
          </button>
        ))}
        {!sessions.length ? <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">No sessions yet.</p> : null}

        <div className="mt-6 rounded-[22px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">File context</h3>
              <span className="text-xs text-zinc-500">{files.length} files</span>
            </div>
          </div>
          <div className="mt-3">
            <input type="file" onChange={(e:any)=>{const file = e.target.files?.[0]; if(file) uploadFile(file);}} className="block w-full cursor-pointer rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-950" />
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
            {files.slice(0, 8).map((file:any) => (
              <div key={file.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-white">{file.original_name}</span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{file.status}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>{file.language ?? "plain text"}</span>
                  <span>{formatBytes(file.size_bytes)}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={()=>reindexFilePrompt(file.id)} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-black/30">Reindex</button>
                  <button onClick={()=>deleteFile(file.id)} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100 transition hover:bg-rose-500/20">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
