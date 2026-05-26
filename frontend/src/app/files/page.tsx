"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpFromLine, RefreshCcw, Search, Trash2, FolderUp } from "lucide-react";
import FileModal from "@/components/FileModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { FileRecord } from "@/lib/dashboard-types";
import { formatBytes, shortId } from "@/lib/uiHelpers";
import { useToast } from "@/components/ui/use-toast";

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
  const { toast } = useToast();
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
      toast({ title: "File uploaded", description: `${result.original_name} is ready for task processing.`, variant: "success" });
      await loadFiles();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setError(message);
      toast({ title: "Upload failed", description: message, variant: "error" });
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
      toast({ title: "File reindexed", description: `${result.original_name} was refreshed successfully.`, variant: "info" });
      await loadFiles();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Reindex failed";
      setError(message);
      toast({ title: "Reindex failed", description: message, variant: "warning" });
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
      toast({ title: "File deleted", description: file?.original_name ? `${file.original_name} was removed.` : "The file was removed.", variant: "warning" });
      setSelectedFileId((current) => (current === fileId ? null : current));
      await loadFiles();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Delete failed";
      setError(message);
      toast({ title: "Delete failed", description: message, variant: "error" });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <>
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

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border bg-card">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-4 border-b border-border/40">
            <div>
              <CardTitle>File Library</CardTitle>
              <CardDescription>Manage context boundaries for vector retrieval.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="border border-border text-xs font-mono uppercase bg-card text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={() => void loadFiles()}>
                <RefreshCcw className="h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button onClick={openUploadPicker} disabled={busyAction === "upload"} className="border border-foreground text-xs font-mono uppercase bg-foreground text-background hover:opacity-90">
                <ArrowUpFromLine className="h-3.5 w-3.5" />
                {busyAction === "upload" ? "Uploading..." : "Upload Context"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader className="border-border hover:bg-transparent">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Name</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Status</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Language</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Size</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500">Source</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-zinc-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id} className="group border-zinc-850 hover:bg-zinc-900/30">
                    <TableCell>
                      <button onClick={() => setSelectedFileId(file.id)} className="text-left outline-none">
                        <div className="font-semibold text-foreground font-mono text-sm group-hover:underline">{file.original_name}</div>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5">{shortId(file.id)}</div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={file.status === "ready" ? "success" : file.status === "failed" ? "destructive" : "secondary"} className="font-mono text-[10px] uppercase">
                        {file.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">{file.language ?? "plain text"}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">{formatBytes(file.size_bytes)}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">{file.session_id ? shortId(file.session_id) : "global"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="border border-transparent text-xs font-mono uppercase text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900" size="sm" onClick={() => setSelectedFileId(file.id)}>
                          <Search className="h-3.5 w-3.5" />
                          Details
                        </Button>
                        <Button variant="secondary" className="border border-border text-xs font-mono uppercase bg-card text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900" size="sm" onClick={() => openReindexPicker(file.id)} disabled={busyAction === "reindex"}>
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Reindex
                        </Button>
                        <Button variant="destructive" className="border border-rose-500/20 text-xs font-mono uppercase bg-rose-500/5 text-rose-400 hover:bg-rose-500/10" size="sm" onClick={() => void handleDelete(file.id)} disabled={busyAction === "delete"}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!files.length && <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs font-mono text-zinc-500">NO CONTEXT FILES UPLOADED YET.</div>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle>RAG Telemetry Guide</CardTitle>
              <CardDescription>How the pgvector indexing engine runs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs font-mono text-zinc-500 pt-6">
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3">
                <div className="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-1">Index Chunking</div>
                <div>Documents are parsed into syntactic, language-aware chunks for vector matching.</div>
              </div>
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3">
                <div className="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-1">Reindexing</div>
                <div>Refreshing files triggers a background deletion of old vector rows and regenerates dense embeddings.</div>
              </div>
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3">
                <div className="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-1">Durable Purge</div>
                <div>Deletions run cascades that completely wipe file_chunks, embeddings, and response references.</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle>Context Balance</CardTitle>
              <CardDescription>Overall counts and validation quotas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 grid-cols-2 pt-6">
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Total Files</div>
                <div className="mt-1 text-xl font-bold font-mono text-foreground">{files.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900/30 px-4 py-3">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">Ready Index</div>
                <div className="mt-1 text-xl font-bold font-mono text-foreground">{files.filter((file) => file.status === "ready").length}</div>
              </div>
            </CardContent>
          </Card>

          {status && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs font-mono text-emerald-400">{status}</div>}
          {error && <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 px-4 py-3 text-xs font-mono text-rose-300">[ERROR]: {error}</div>}
        </div>
      </div>

      <FileModal
        fileDetails={selectedFile}
        onClose={() => setSelectedFileId(null)}
        onReindex={(file) => openReindexPicker(file.id)}
        onDelete={(file) => void handleDelete(file.id)}
        busyAction={busyAction === "reindex" ? "reindex" : busyAction === "delete" ? "delete" : null}
      />
    </>
  );
}