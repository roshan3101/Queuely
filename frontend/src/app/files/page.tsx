"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpFromLine, RefreshCcw, Search, Trash2, FolderUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import FileModal from "@/components/FileModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearTokens, readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { FileRecord } from "@/lib/dashboard-types";
import { formatBytes, shortId } from "@/lib/uiHelpers";

const FILE_ACCEPT = ".py,.js,.ts,.tsx,.jsx,.json,.md,.pdf,.sql,.yaml,.yml,.txt,.toml,.cfg,.ini,.css,.html";

export default function FilesPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"upload" | "reindex" | "delete" | null>(null);
  const [pendingReindexFileId, setPendingReindexFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const reindexInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  const loadFiles = useCallback(async () => {
    if (!tokenState.accessToken) return;
    const data = await dashboardApi.listFiles(tokenState, setTokenState);
    setFiles(data.items);
  }, [tokenState]);

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;
    loadFiles().catch((e) => setError(e instanceof Error ? e.message : "Failed to load files"));
  }, [loadFiles, ready, tokenState.accessToken]);

  const selectedFile = useMemo(() => files.find((file) => file.id === selectedFileId) ?? null, [files, selectedFileId]);

  const openUploadPicker = () => uploadInputRef.current?.click();

  const openReindexPicker = (fileId: string) => {
    setPendingReindexFileId(fileId);
    reindexInputRef.current?.click();
  };

  const handleUpload = async (file: File) => {
    setBusyAction("upload");
    setError(null);
    setStatus(null);
    try {
      const result = await dashboardApi.uploadFile(tokenState, setTokenState, file);
      setStatus(`Uploaded ${result.original_name} (${result.status}).`);
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyAction(null);
    }
  };

  const handleReindex = async (fileId: string, file: File) => {
    setBusyAction("reindex");
    setError(null);
    setStatus(null);
    try {
      const result = await dashboardApi.reindexFile(tokenState, setTokenState, fileId, file);
      setStatus(`Reindexed ${result.original_name} (${result.status}).`);
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reindex failed");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (fileId: string) => {
    const file = files.find((item) => item.id === fileId);
    const confirmed = window.confirm(`Delete ${file?.original_name ?? "this file"}? This cannot be undone.`);
    if (!confirmed) return;

    setBusyAction("delete");
    setError(null);
    setStatus(null);
    try {
      const result = await dashboardApi.deleteFile(tokenState, setTokenState, fileId);
      setStatus(result.deleted ? "File deleted." : "Delete request completed.");
      setSelectedFileId((current) => (current === fileId ? null : current));
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <AppShell title="Files" subtitle="Uploaded sources, reindexing, and cleanup" onSignOut={clearTokens}>
      <input
        ref={uploadInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            void handleUpload(file);
          }
        }}
      />
      <input
        ref={reindexInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          const fileId = pendingReindexFileId;
          setPendingReindexFileId(null);
          if (fileId && file) {
            void handleReindex(fileId, file);
          }
        }}
      />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>File library</CardTitle>
              <CardDescription>Upload source files, inspect metadata, reindex replacements, or delete stale files.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void loadFiles()}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={openUploadPicker} disabled={busyAction === "upload"}>
                <ArrowUpFromLine className="h-4 w-4" />
                {busyAction === "upload" ? "Uploading..." : "Upload file"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id} className="group hover:bg-white/5">
                    <TableCell>
                      <button onClick={() => setSelectedFileId(file.id)} className="text-left">
                        <div className="font-medium text-white transition group-hover:text-cyan-200">{file.original_name}</div>
                        <div className="text-xs text-zinc-500">{shortId(file.id)}</div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={file.status === "ready" ? "success" : file.status === "failed" ? "destructive" : "secondary"}>{file.status}</Badge>
                    </TableCell>
                    <TableCell>{file.language ?? "plain text"}</TableCell>
                    <TableCell>{formatBytes(file.size_bytes)}</TableCell>
                    <TableCell>{file.session_id ? shortId(file.session_id) : "global"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedFileId(file.id)}>
                          <Search className="h-4 w-4" />
                          Details
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openReindexPicker(file.id)} disabled={busyAction === "reindex"}>
                          <RefreshCcw className="h-4 w-4" />
                          Reindex
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => void handleDelete(file.id)} disabled={busyAction === "delete"}>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!files.length ? <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No files uploaded yet.</div> : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
              <CardDescription>Pick a file to open details, replace its source, or remove it entirely.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Upload</div>
                <div className="mt-1">Add a new source file and let the backend chunk and embed it.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Reindex</div>
                <div className="mt-1">Choose a replacement file to refresh the stored chunks and embeddings.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Delete</div>
                <div className="mt-1">Remove stale or incorrect files from the index and storage.</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>File summary</CardTitle>
              <CardDescription>Quick snapshot of the current library.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Total files</div>
                <div className="mt-1 text-2xl font-semibold text-white">{files.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Ready files</div>
                <div className="mt-1 text-2xl font-semibold text-white">{files.filter((file) => file.status === "ready").length}</div>
              </div>
            </CardContent>
          </Card>

          {status ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{status}</div> : null}
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </div>
      </div>

      <FileModal
        fileDetails={selectedFile}
        onClose={() => setSelectedFileId(null)}
        onReindex={(file) => openReindexPicker(file.id)}
        onDelete={(file) => void handleDelete(file.id)}
        busyAction={busyAction === "reindex" ? "reindex" : busyAction === "delete" ? "delete" : null}
      />
    </AppShell>
  );
}