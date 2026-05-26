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
import type { JobRecord } from "@/lib/dashboard-types";
import { useToast } from "@/components/ui/use-toast";
import { ArrowRight, ArrowLeft, Terminal, ShieldAlert, CheckCircle } from "lucide-react";

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
  priority: number;
  maxRetries: number;
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

export default function TaskLauncherPage() {
  const [tokenState, setTokenState] = useState<TokenState>({ accessToken: "", refreshToken: "" });
  const [ready, setReady] = useState(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [uploadedArtifact, setUploadedArtifact] = useState<TaskArtifact | null>(null);
  
  // Wizard state: Step 1, 2, 3
  const [step, setStep] = useState(1);

  const [taskDraft, setTaskDraft] = useState<TaskDraft>({
    jobType: "pdf_processing",
    pdfPreviewChars: "500",
    pdfEnableOcr: true,
    pdfEnableTables: true,
    reportTitle: "Infrastructure Audit",
    reportFormat: "md",
    reportProvider: "gemini",
    reportProviderModel: "",
    reportSummary: "",
    reportSections: "Overview\n\nFindings\nAll services operational.",
    emailTo: "",
    emailSubject: "Durable Queue Delivery Updates",
    emailBody: "Task processing completed.",
    emailHtml: "",
    emailDryRun: true,
    priority: 5,
    maxRetries: 5,
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

  const refresh = () => {
    if (!ready || !tokenState.accessToken) return;
    void dashboardApi.listJobs(tokenState, setTokenState).then((data) => setJobs(data.items)).catch(() => void 0);
  };

  useEffect(() => {
    if (!ready || !tokenState.accessToken) return;
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [ready, tokenState]);

  const recentJobs = useMemo(() => jobs.slice(0, 6), [jobs]);
  const latestResultJob = useMemo(() => jobs.find((job) => job.result) ?? submittedJob ?? null, [jobs, submittedJob]);

  // Compute final payload dynamic preview
  const payloadPreview = useMemo(() => {
    if (taskDraft.jobType === "pdf_processing") {
      return {
        cloudinary_url: uploadedArtifact?.storage_url || "UPLOADING_REQUIRED...",
        preview_chars: Number(taskDraft.pdfPreviewChars) || 500,
        enable_ocr: taskDraft.pdfEnableOcr,
        enable_table_extraction: taskDraft.pdfEnableTables,
        metadata: {
          file_id: uploadedArtifact?.file_id ?? null,
          original_name: uploadedArtifact?.original_name ?? null,
        },
      };
    } else if (taskDraft.jobType === "report_generation") {
      return {
        title: taskDraft.reportTitle.trim(),
        format: taskDraft.reportFormat,
        provider: taskDraft.reportProvider,
        provider_model: taskDraft.reportProviderModel.trim() || null,
        summary: taskDraft.reportSummary.trim() || null,
        sections: parseReportSections(taskDraft.reportSections),
        metadata: {
          file_id: uploadedArtifact?.file_id ?? null,
        },
      };
    } else {
      return {
        to: taskDraft.emailTo.split(/[\n,]/).map((r) => r.trim()).filter(Boolean),
        subject: taskDraft.emailSubject.trim(),
        body: taskDraft.emailBody.trim(),
        html: taskDraft.emailHtml.trim() || null,
        dry_run: taskDraft.emailDryRun,
        metadata: {
          file_id: uploadedArtifact?.file_id ?? null,
        },
      };
    }
  }, [taskDraft, uploadedArtifact]);

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
      setTaskMessage(`Context file loaded: ${uploaded.original_name}.`);
      toast({ title: "File loaded", description: `${uploaded.original_name} is active.`, variant: "success" });
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
      if (taskDraft.jobType === "pdf_processing" && !uploadedArtifact) {
        throw new Error("PDF processing requires an uploaded context file. Go back to Step 1.");
      }

      const created = await dashboardApi.createJob(
        tokenState,
        setTokenState,
        taskDraft.jobType,
        payloadPreview,
        {
          priority: taskDraft.priority,
          maxRetries: taskDraft.maxRetries,
        }
      );

      setSubmittedJob(created);
      setTaskMessage(`Task deployed under UUID: ${created.id}`);
      toast({ title: "Task dispatched", description: `Task run queued as ${created.id.slice(0, 8)}.`, variant: "success" });
      setStep(1); // Reset wizard
      refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to submit task";
      setError(message);
      toast({ title: "Dispatch failed", description: message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="border-border bg-card text-foreground shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-mono text-sm uppercase tracking-wider">Task Deployer Wizard</CardTitle>
              <CardDescription className="text-muted-foreground">Configure and execute containerized celery tasks.</CardDescription>
            </div>
            <span className="font-mono text-xs text-foreground bg-muted border border-border px-2.5 py-1 rounded">
              STEP {step} / 3
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 flex h-1 w-full bg-muted rounded-full overflow-hidden">
            <div className="bg-foreground transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          
          {/* STEP 1: INITIAL SELECTION & CONTEXT FILE */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Select Task Blueprint</Label>
                <select
                  value={taskDraft.jobType}
                  onChange={(event) => setTaskDraft((current) => ({ ...current, jobType: event.target.value as JobType }))}
                  className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-mono text-foreground outline-none focus:border-foreground"
                >
                  <option value="pdf_processing">PDF Processing & OCR Sandbox</option>
                  <option value="report_generation">Semantic LLM Report Engine</option>
                  <option value="email_sending">Distributed SMTP Delivery Engine</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Upload Context File (Optional)</Label>
                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center">
                  <Input
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadTaskFile(file);
                    }}
                    className="border-border bg-card cursor-pointer text-muted-foreground"
                  />
                  <p className="mt-2 text-xs text-muted-foreground font-mono">
                    {uploadedArtifact ? `ACTIVE: ${uploadedArtifact.original_name}` : "DRAG FILES OR BROWSE LOCAL DIRECTORIES"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setStep(2)}
                  className="font-mono text-xs uppercase tracking-wider bg-white text-black hover:bg-zinc-200"
                >
                  Configure Inputs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: DYNAMIC PAYLOAD SETTINGS */}
          {step === 2 && (
            <div className="space-y-6">
              {taskDraft.jobType === "pdf_processing" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Preview Character Budget</Label>
                    <Input
                      value={taskDraft.pdfPreviewChars}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, pdfPreviewChars: event.target.value }))}
                      inputMode="numeric"
                      className="border-border bg-card font-mono text-sm text-foreground"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <label className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 p-3.5 text-xs font-mono text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={taskDraft.pdfEnableOcr}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, pdfEnableOcr: event.target.checked }))}
                        className="rounded border-border accent-foreground"
                      />
                      OCR FALLBACK
                    </label>
                    <label className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 p-3.5 text-xs font-mono text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={taskDraft.pdfEnableTables}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, pdfEnableTables: event.target.checked }))}
                        className="rounded border-border accent-foreground"
                      />
                      EXTRACT TABLES
                    </label>
                  </div>
                </div>
              )}

              {taskDraft.jobType === "report_generation" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Format</Label>
                      <select
                        value={taskDraft.reportFormat}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, reportFormat: event.target.value as TaskDraft["reportFormat"] }))}
                        className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-mono text-foreground outline-none"
                      >
                        <option value="json">JSON</option>
                        <option value="md">Markdown</option>
                        <option value="txt">Plain Text</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">LLM Provider</Label>
                      <select
                        value={taskDraft.reportProvider}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, reportProvider: event.target.value as TaskDraft["reportProvider"] }))}
                        className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-mono text-foreground outline-none"
                      >
                        <option value="template">Template Built-in</option>
                        <option value="openai">OpenAI GPT-4</option>
                        <option value="gemini">Google Gemini 1.5</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Title</Label>
                    <Input
                      value={taskDraft.reportTitle}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, reportTitle: event.target.value }))}
                      className="border-border bg-card text-sm text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Report Outline & Sections</Label>
                    <Textarea
                      value={taskDraft.reportSections}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, reportSections: event.target.value }))}
                      rows={4}
                      className="border-border bg-card text-xs font-mono text-foreground"
                      placeholder="Use paragraph blocks for sections"
                    />
                  </div>
                </div>
              )}

              {taskDraft.jobType === "email_sending" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Recipient SMTP Address</Label>
                    <Input
                      value={taskDraft.emailTo}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, emailTo: event.target.value }))}
                      className="border-zinc-800 bg-zinc-900 text-sm font-mono"
                        className="border-border bg-card text-sm font-mono text-foreground"
                      placeholder="operator@queuely.internal"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Subject</Label>
                    <Input
                      value={taskDraft.emailSubject}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, emailSubject: event.target.value }))}
                      className="border-zinc-800 bg-zinc-900 text-sm"
                                          className="border-border bg-card text-sm text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Body</Label>
                    <Textarea
                      value={taskDraft.emailBody}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, emailBody: event.target.value }))}
                      rows={3}
                      className="border-zinc-800 bg-zinc-900 text-xs font-mono"
                                          className="border-border bg-card text-xs font-mono text-foreground"
                    />
                  </div>
                  <label className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 p-3.5 text-xs font-mono text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={taskDraft.emailDryRun}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, emailDryRun: event.target.checked }))}
                      className="rounded border-border accent-foreground"
                    />
                    FORCE DRY-RUN SMTP METRIC MOCK
                  </label>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t border-border/60">
                <Button
                  onClick={() => setStep(1)}
                  variant="outline"
                  className="font-mono text-xs uppercase tracking-wider border-border text-muted-foreground hover:bg-muted"
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="font-mono text-xs uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90"
                >
                  Review Settings <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: PLATFORM SETTINGS & DEPLOY REVIEW */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Priority Weight (1-9)</Label>
                  <select
                    value={taskDraft.priority}
                    onChange={(event) => setTaskDraft((current) => ({ ...current, priority: Number(event.target.value) }))}
                    className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-mono text-foreground outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                      <option key={p} value={p}>{p} {p === 5 ? "(Normal)" : p > 5 ? "(High)" : "(Low)"}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">Max Retries</Label>
                  <Input
                    type="number"
                    value={taskDraft.maxRetries}
                    onChange={(event) => setTaskDraft((current) => ({ ...current, maxRetries: Number(event.target.value) || 3 }))}
                    className="border-border bg-card font-mono text-sm text-foreground"
                  />
                </div>
              </div>

              {/* JSON payload compiler overview */}
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <Terminal className="h-3.5 w-3.5" /> Payload JSON Compilation
                </div>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-[10px] font-mono leading-relaxed text-muted-foreground">
                  {JSON.stringify(payloadPreview, null, 2)}
                </pre>
              </div>

              <div className="flex justify-between pt-4 border-t border-border/60">
                <Button
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="font-mono text-xs uppercase tracking-wider border-border text-muted-foreground hover:bg-muted"
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  onClick={() => void submitTask()}
                  disabled={busy}
                  className="font-mono text-xs uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90"
                >
                  {busy ? "Deploying..." : "Deploy Blueprint Task"}
                </Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* SIDE TIMELINES */}
      <div className="space-y-6">
        <Card className="border-border bg-card text-foreground shadow-sm">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Result Console</CardTitle>
            <CardDescription className="text-muted-foreground">Output verification from Celery containers.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {latestResultJob ? (
              <>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="font-mono text-xs uppercase tracking-wider border-border text-foreground">
                    {latestResultJob.job_type}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{latestResultJob.id.slice(0, 8)}</span>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs font-mono leading-relaxed text-foreground max-h-48 overflow-y-auto">
                  {latestResultJob.result ? (
                    <pre>{JSON.stringify(latestResultJob.result, null, 2)}</pre>
                  ) : (
                    <span className="text-muted-foreground">[WAITING FOR ASYNC RESULT STREAM...]</span>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs font-mono text-muted-foreground">
                DEPLOY A BLUEPRINT TASK TO SEE ACTIVE STDOUT/STDERR.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-foreground shadow-sm">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Deploy Pipeline History</CardTitle>
            <CardDescription className="text-muted-foreground">Auditable state log of your recent task runs.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {recentJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-border bg-muted/30 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground font-mono text-sm">{job.job_type}</span>
                  <span className="font-mono text-[10px] border border-border px-2 py-0.5 rounded uppercase tracking-wider text-muted-foreground bg-card">
                    {job.status}
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-muted-foreground">UUID: {job.id.slice(0, 8)}</div>
              </div>
            ))}
            {!recentJobs.length ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs font-mono text-muted-foreground">
                NO HISTORY REPORTED.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
