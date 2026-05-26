/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React from "react";
import { MessageBody, ReferencedFiles } from "../lib/uiHelpers";

export default function ChatMain({
  activeSession,
  isLoading,
  messages,
  isStreaming,
  sendMessage,
  draft,
  setDraft,
  fileMap,
  cancelStream,
}: any) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{activeSession?.title ?? "Select a task"}</h2>
          <p className="text-sm text-zinc-500">{isLoading ? "Refreshing..." : activeSession ? `Task ${activeSession.id.slice(0,8)}` : "Create or select a task to continue."}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{messages.length} messages</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{isStreaming ? "streaming" : "idle"}</span>
        </div>
      </div>

      <div className="max-h-[calc(100vh-23rem)] min-h-112 overflow-y-auto px-5 py-5">
        <div className="space-y-4">
          {messages.map((message:any) => (
            <article key={message.id} className={`rounded-3xl border p-4 ${message.role === "user" ? "ml-auto max-w-[85%] border-cyan-400/20 bg-cyan-400/10" : "mr-auto max-w-[92%] border-white/10 bg-black/20"}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">{message.role}</span>
                <span className="text-[11px] text-zinc-500">#{message.sequence_number}</span>
              </div>
              <MessageBody content={message.content} />
              <ReferencedFiles files={fileMap} referencedIds={message.referenced_files} />
            </article>
          ))}
          {!messages.length ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/10 p-8 text-center text-sm text-zinc-500">No messages yet. Send a prompt to start a streaming assistant reply.</div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/10 p-5">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <textarea value={draft} onChange={(e:any)=>setDraft(e.target.value)} rows={5} placeholder="Ask a question about the current task, uploaded files, or generated output..." className="w-full resize-none bg-transparent text-sm leading-7 text-zinc-100 outline-none placeholder:text-zinc-600" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">Streaming uses <code>POST /sessions/{"{session_id}"}/messages/stream</code> and persists the final assistant response plus provenance.</div>
            <div className="flex items-center gap-2">
              <button disabled={!activeSession || !draft.trim() || isStreaming} onClick={()=>sendMessage()} className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40">{isStreaming ? "Sending..." : "Send message"}</button>
              {isStreaming ? (<button onClick={()=>cancelStream()} className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20">Cancel</button>) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
