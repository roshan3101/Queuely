/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React from "react";
import { formatBytes } from "../lib/uiHelpers";

export default function FileModal({ fileDetails, onClose, reindexFilePrompt, deleteFile, opsBusy }: any) {
  if (!fileDetails) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur sm:items-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#060c12] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">File</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{fileDetails.original_name}</h3>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200">Close</button>
        </div>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">File info</div>
            <div className="mt-2 space-y-2 text-sm text-zinc-200">
              <div>
                <div className="text-[11px] text-zinc-500">Name</div>
                <div>{fileDetails.original_name}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Language</div>
                <div>{fileDetails.language ?? "plain text"}</div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Size</div>
                <div>{formatBytes(fileDetails.size_bytes)}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => reindexFilePrompt(fileDetails.id)} disabled={opsBusy} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">Reindex</button>
              <button onClick={async () => { await deleteFile(fileDetails.id); onClose(); }} disabled={opsBusy} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">Delete</button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Preview</div>
            <div className="mt-2 max-h-56 overflow-auto text-sm text-zinc-200">
              <pre className="whitespace-pre-wrap">{fileDetails.original_name}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
