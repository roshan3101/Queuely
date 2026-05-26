"use client";

import { FileText, RefreshCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileRecord } from "@/lib/dashboard-types";
import { formatBytes, shortId } from "@/lib/uiHelpers";

type FileModalProps = {
  fileDetails: FileRecord | null;
  onClose: () => void;
  onReindex: (file: FileRecord) => void;
  onDelete: (file: FileRecord) => void;
  busyAction?: "reindex" | "delete" | null;
};

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className="mt-1 text-sm text-zinc-100">{value}</div>
    </div>
  );
}

export default function FileModal({ fileDetails, onClose, onReindex, onDelete, busyAction }: FileModalProps) {
  if (!fileDetails) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur sm:items-center">
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#060c12] shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">File</p>
            <h3 className="mt-1 truncate text-lg font-semibold text-white">{fileDetails.original_name}</h3>
            <p className="mt-1 text-sm text-zinc-400">Reindex uploads a replacement file and replaces the stored chunks.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close file details">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_0.9fr]">
          <Card className="bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-cyan-300" />
                File details
              </CardTitle>
              <CardDescription>Metadata and actions for the selected upload.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <MetaRow label="Name" value={fileDetails.original_name} />
              <MetaRow label="Language" value={fileDetails.language ?? "plain text"} />
              <MetaRow label="Size" value={formatBytes(fileDetails.size_bytes)} />
              <MetaRow label="File ID" value={shortId(fileDetails.id)} />
              <MetaRow label="Status" value={fileDetails.status} />
              <MetaRow label="Session" value={fileDetails.session_id ? shortId(fileDetails.session_id) : "global"} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="bg-white/5">
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
                <CardDescription>Choose a replacement file to reindex or remove this file entirely.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" variant="secondary" onClick={() => onReindex(fileDetails)} disabled={busyAction !== null}>
                  <RefreshCcw className="h-4 w-4" />
                  {busyAction === "reindex" ? "Reindexing..." : "Reindex with replacement file"}
                </Button>
                <Button className="w-full justify-start" variant="destructive" onClick={() => onDelete(fileDetails)} disabled={busyAction !== null}>
                  <Trash2 className="h-4 w-4" />
                  {busyAction === "delete" ? "Deleting..." : "Delete file"}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white/5">
              <CardHeader>
                <CardTitle className="text-base">Storage state</CardTitle>
                <CardDescription>The backend keeps the indexed chunks and stored source aligned.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-zinc-300">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span>Current status</span>
                  <Badge variant="secondary">{fileDetails.status}</Badge>
                </div>
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-zinc-400">
                  Upload a replacement source file to refresh embeddings and chunk metadata.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}