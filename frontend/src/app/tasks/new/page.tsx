"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readTokens, type TokenState } from "@/lib/authStorage";
import { dashboardApi } from "@/lib/dashboard-api";
import type { FileRecord, JobRecord } from "@/lib/dashboard-types";
import { useToast } from "@/components/ui/use-toast";

type JobType = "pdf_processing" | "report_generation" | "email_sending";

type TaskDraft = {
  jobType: JobType;
  pdfPreviewChars: string;
  pdfEnableOcr: boolean;
  pdfEnableTables: boolean;
  reportTitle: string;
  reportFormat: "json" | "md" | "txt";
  reportProvider: "template" | "openai" | "gemini";
  reportProviderModel: string;
  reportSummary: string;
  reportSections: string;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  emailHtml: string;
  emailDryRun: boolean;
};

type TaskArtifact = {
  file_id: string;
  original_name: string;
  storage_provider: string | null;
  storage_url: string | null;
};

function parseReportSections(rawSections: string) {
  const sections = rawSections
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section, index) => {
    const [heading, ...bodyLines] = section.split("\n");
    const body = bodyLines.join("\n").trim();
    return body ? { heading: heading.trim(), body } : { heading: `Section ${index + 1}`, body: heading.trim() };
  });
}

function formatResult(result: JobRecord["result"]) {
  if (!result) return "No result yet.";
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export default function TaskLauncherPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [uploadedArtifact, setUploadedArtifact] = useState<TaskArtifact | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({
    jobType: "pdf_processing",
    pdfPreviewChars: "500",
    pdfEnableOcr: true,
    pdfEnableTables: true,
    reportTitle: "Task report",
    reportFormat: "md",
    reportProvider: "gemini",
    reportProviderModel: "",
    reportSummary: "",
    reportSections: "Overview\n\nFindings",
    emailTo: "",
    emailSubject: "Task update",
    emailBody: "",
    emailHtml: "",
    emailDryRun: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [submittedJob, setSubmittedJob] = useState<JobRecord | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setTokenState(readTokens());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;

    const refresh = () => {
      void Promise.all([
        dashboardApi.listFiles(tokenState, setTokenState).then((data) => setFiles(data.items)).catch(() => void 0),
        dashboardApi.listJobs(tokenState, setTokenState).then((data) => setJobs(data.items)).catch(() => void 0),
      ]);
    };

    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [ready, tokenState]);

  const activeFile = useMemo(() => {
    if (selectedFileId) {
      return files.find((file) => file.id === selectedFileId) ?? null;
    }
    if (uploadedArtifact) {
      return files.find((file) => file.id === uploadedArtifact.file_id) ?? null;
    }
    return null;
  }, [files, selectedFileId, uploadedArtifact]);

  const recentJobs = useMemo(() => jobs.slice(0, 8), [jobs]);
  const latestResultJob = useMemo(() => jobs.find((job) => job.result) ?? submittedJob ?? null, [jobs, submittedJob]);

  async function uploadTaskFile(file: File) {
    setBusy(true);
    setError(null);
    setTaskMessage(null);
    try {
      const uploaded = await dashboardApi.uploadFile(tokenState, setTokenState, file);
      setUploadedArtifact({
        file_id: uploaded.file_id,
        original_name: uploaded.original_name,
        storage_provider: uploaded.storage_provider,
        storage_url: uploaded.storage_url,
      });
      setSelectedFileId(uploaded.file_id);
      const refreshed = await dashboardApi.listFiles(tokenState, setTokenState);
      setFiles(refreshed.items);
      setTaskMessage(`Uploaded ${uploaded.original_name}.`);
      toast({ title: "File uploaded", description: `${uploaded.original_name} is ready for a task.`, variant: "success" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to upload file";
      setError(message);
      toast({ title: "Upload failed", description: message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function submitTask() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setTaskMessage(null);

    try {
      if (taskDraft.jobType === "pdf_processing") {
        const sourceFile = activeFile ?? uploadedArtifact;
        if (!sourceFile?.storage_url) {
          const message = "Upload or choose a file before launching PDF processing.";
          toast({ title: "File required", description: message, variant: "warning" });
          throw new Error(message);
        }
        const sourceFileId = "file_id" in sourceFile ? sourceFile.file_id : sourceFile.id;

        const created = await dashboardApi.createJob(tokenState, setTokenState, "pdf_processing", {
          cloudinary_url: sourceFile.storage_url,
          preview_chars: Number(taskDraft.pdfPreviewChars) || 500,
          enable_ocr: taskDraft.pdfEnableOcr,
          enable_table_extraction: taskDraft.pdfEnableTables,
          metadata: {
            file_id: sourceFileId,
            original_name: sourceFile.original_name,
          },
        });
        setSubmittedJob(created);
        setTaskMessage("PDF processing task started.");
        toast({ title: "Task started", description: `PDF processing submitted as ${created.id}.`, variant: "success" });
      } else if (taskDraft.jobType === "report_generation") {
        const created = await dashboardApi.createJob(tokenState, setTokenState, "report_generation", {
          title: taskDraft.reportTitle.trim() || "Task report",
          format: taskDraft.reportFormat,
          provider: taskDraft.reportProvider,
          provider_model: taskDraft.reportProviderModel.trim() || null,
          summary: taskDraft.reportSummary.trim() || null,
          sections: parseReportSections(taskDraft.reportSections),
          metadata: {
            file_id: activeFile?.id ?? uploadedArtifact?.file_id ?? null,
          },
        });
        setSubmittedJob(created);
        setTaskMessage("Report generation task started with Gemini as the default provider.");
        toast({ title: "Task started", description: `Report generation submitted as ${created.id}.`, variant: "info" });
      } else {
        const created = await dashboardApi.createJob(tokenState, setTokenState, "email_sending", {
          to: taskDraft.emailTo
            .split(/[\n,]/)
            .map((recipient) => recipient.trim())
            .filter(Boolean),
          subject: taskDraft.emailSubject.trim() || "Task update",
          body: taskDraft.emailBody.trim(),
          html: taskDraft.emailHtml.trim() || null,
          dry_run: taskDraft.emailDryRun,
          metadata: {
            file_id: activeFile?.id ?? uploadedArtifact?.file_id ?? null,
          },
        });
        setSubmittedJob(created);
        setTaskMessage("Email task started.");
        toast({ title: "Task started", description: `Email sending submitted as ${created.id}.`, variant: "success" });
      }

      const refreshed = await dashboardApi.listJobs(tokenState, setTokenState);
      setJobs(refreshed.items);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to submit task";
      setError(message);
      toast({ title: "Task submission failed", description: message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Task launcher</CardTitle>
          <CardDescription>Upload a file, choose a task, and run it directly.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Task type</Label>
            <select value={taskDraft.jobType} onChange={(event) => setTaskDraft((current) => ({ ...current, jobType: event.target.value as JobType }))} className="w-full bg-transparent text-sm outline-none">
              <option value="pdf_processing">pdf_processing</option>
              <option value="report_generation">report_generation</option>
              <option value="email_sending">email_sending</option>
            </select>
          </label>

          <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Upload file</Label>
            <Input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadTaskFile(file); }} className="border-white/10 bg-black/10" />
            <p className="text-xs text-zinc-500">Uploaded files can be reused by future tasks.</p>
          </label>

          <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Selected file</Label>
            <select value={selectedFileId} onChange={(event) => setSelectedFileId(event.target.value)} className="w-full bg-transparent text-sm outline-none">
              <option value="">Use the uploaded file or pick one from the list</option>
              {files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.original_name} {file.storage_provider ? `(${file.storage_provider})` : ""}
                </option>
              ))}
            </select>
          </label>

          {taskDraft.jobType === "pdf_processing" ? (
            <div className="space-y-3">
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Preview chars</Label>
                <Input value={taskDraft.pdfPreviewChars} onChange={(event) => setTaskDraft((current) => ({ ...current, pdfPreviewChars: event.target.value }))} inputMode="numeric" className="border-white/10 bg-black/10" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200"><input type="checkbox" checked={taskDraft.pdfEnableOcr} onChange={(event) => setTaskDraft((current) => ({ ...current, pdfEnableOcr: event.target.checked }))} /> OCR fallback</label>
                <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200"><input type="checkbox" checked={taskDraft.pdfEnableTables} onChange={(event) => setTaskDraft((current) => ({ ...current, pdfEnableTables: event.target.checked }))} /> Extract tables</label>
              </div>
            </div>
          ) : null}

          {taskDraft.jobType === "report_generation" ? (
            <div className="space-y-3">
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Title</Label>
                <Input value={taskDraft.reportTitle} onChange={(event) => setTaskDraft((current) => ({ ...current, reportTitle: event.target.value }))} className="border-white/10 bg-black/10" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Format</Label>
                  <select value={taskDraft.reportFormat} onChange={(event) => setTaskDraft((current) => ({ ...current, reportFormat: event.target.value as TaskDraft["reportFormat"] }))} className="w-full bg-transparent text-sm outline-none">
                    <option value="json">json</option><option value="md">md</option><option value="txt">txt</option>
                  </select>
                </label>
                <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Provider</Label>
                  <select value={taskDraft.reportProvider} onChange={(event) => setTaskDraft((current) => ({ ...current, reportProvider: event.target.value as TaskDraft["reportProvider"] }))} className="w-full bg-transparent text-sm outline-none">
                    <option value="template">template</option><option value="openai">openai</option><option value="gemini">gemini</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Provider model</Label><Input value={taskDraft.reportProviderModel} onChange={(event) => setTaskDraft((current) => ({ ...current, reportProviderModel: event.target.value }))} className="border-white/10 bg-black/10" placeholder="Optional override" /></label>
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Summary</Label><Textarea value={taskDraft.reportSummary} onChange={(event) => setTaskDraft((current) => ({ ...current, reportSummary: event.target.value }))} rows={3} className="border-white/10 bg-black/10" placeholder="Short executive summary" /></label>
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Sections</Label><Textarea value={taskDraft.reportSections} onChange={(event) => setTaskDraft((current) => ({ ...current, reportSections: event.target.value }))} rows={6} className="border-white/10 bg-black/10" placeholder={"Overview\n\nFindings"} /></label>
            </div>
          ) : null}

          {taskDraft.jobType === "email_sending" ? (
            <div className="space-y-3">
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">To</Label><Input value={taskDraft.emailTo} onChange={(event) => setTaskDraft((current) => ({ ...current, emailTo: event.target.value }))} className="border-white/10 bg-black/10" placeholder="user@example.com" /></label>
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Subject</Label><Input value={taskDraft.emailSubject} onChange={(event) => setTaskDraft((current) => ({ ...current, emailSubject: event.target.value }))} className="border-white/10 bg-black/10" placeholder="Task update" /></label>
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Body</Label><Textarea value={taskDraft.emailBody} onChange={(event) => setTaskDraft((current) => ({ ...current, emailBody: event.target.value }))} rows={4} className="border-white/10 bg-black/10" placeholder="Plain text message" /></label>
              <label className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><Label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">HTML</Label><Textarea value={taskDraft.emailHtml} onChange={(event) => setTaskDraft((current) => ({ ...current, emailHtml: event.target.value }))} rows={4} className="border-white/10 bg-black/10" placeholder="<p><strong>Status</strong> update</p>" /></label>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200"><input type="checkbox" checked={taskDraft.emailDryRun} onChange={(event) => setTaskDraft((current) => ({ ...current, emailDryRun: event.target.checked }))} /> Force dry-run artifact</label>
            </div>
          ) : null}

          {activeFile ? <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">Using {activeFile.original_name} from {activeFile.storage_provider ?? "session storage"}.</div> : null}
          {taskMessage ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">{taskMessage}</div> : null}
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

          <Button onClick={() => void submitTask()} disabled={!ready || busy} className="w-full">{busy ? "Submitting..." : "Start task"}</Button>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Latest result</CardTitle>
            <CardDescription>The most recent submitted job and any result it has produced so far.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestResultJob ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{latestResultJob.job_type}</Badge>
                  <Badge variant={latestResultJob.status === "dead_lettered" ? "destructive" : "secondary"}>{latestResultJob.status}</Badge>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200">
                  <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-zinc-300">{formatResult(latestResultJob.result)}</pre>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">Launch a task to see its output here.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent tasks</CardTitle>
            <CardDescription>Current queue history with payload and result snapshots.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentJobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-white">{job.job_type}</span>
                  <Badge variant={job.status === "dead_lettered" ? "destructive" : "secondary"}>{job.status}</Badge>
                </div>
                <div className="mt-2 text-xs text-zinc-500">Created {new Date(job.created_at).toLocaleString()}</div>
                <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-zinc-400">{JSON.stringify(job.payload)}</div>
                {job.result ? <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-50">{formatResult(job.result)}</div> : null}
              </div>
            ))}
            {!recentJobs.length ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-zinc-500">No tasks launched yet.</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
