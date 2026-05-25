"use client";

type JobType = "pdf_processing" | "report_generation" | "email_sending";

export type JobDraft = {
  jobType: JobType;
  pdfFilePath: string;
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{children}</span>;
}

export default function JobLauncher({
  jobDraft,
  setJobDraft,
  submitJob,
  opsBusy,
}: {
  jobDraft: JobDraft;
  setJobDraft: React.Dispatch<React.SetStateAction<JobDraft>>;
  submitJob: () => void;
  opsBusy: boolean;
}) {
  return (
    <section className="mt-6 rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Launch job</h3>
          <p className="mt-1 text-xs text-zinc-500">Submit PDF, report, or email tasks to Celery.</p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <FieldLabel>Job type</FieldLabel>
          <select
            value={jobDraft.jobType}
            onChange={(event) => setJobDraft((current) => ({ ...current, jobType: event.target.value as JobType }))}
            className="mt-1 w-full bg-transparent text-sm outline-none"
          >
            <option value="pdf_processing">pdf_processing</option>
            <option value="report_generation">report_generation</option>
            <option value="email_sending">email_sending</option>
          </select>
        </label>

        {jobDraft.jobType === "pdf_processing" ? (
          <div className="space-y-3">
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>PDF file path</FieldLabel>
              <input
                value={jobDraft.pdfFilePath}
                onChange={(event) => setJobDraft((current) => ({ ...current, pdfFilePath: event.target.value }))}
                className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="backend/storage/uploads/.../document.pdf"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>Preview chars</FieldLabel>
              <input
                value={jobDraft.pdfPreviewChars}
                onChange={(event) => setJobDraft((current) => ({ ...current, pdfPreviewChars: event.target.value }))}
                className="mt-1 w-full bg-transparent text-sm outline-none"
                inputMode="numeric"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={jobDraft.pdfEnableOcr}
                  onChange={(event) => setJobDraft((current) => ({ ...current, pdfEnableOcr: event.target.checked }))}
                />
                OCR fallback
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={jobDraft.pdfEnableTables}
                  onChange={(event) => setJobDraft((current) => ({ ...current, pdfEnableTables: event.target.checked }))}
                />
                Extract tables
              </label>
            </div>
            <p className="text-[11px] leading-5 text-zinc-500">
              The file path must be inside the backend PDF sandbox roots and Tesseract must be installed for OCR pages.
            </p>
          </div>
        ) : null}

        {jobDraft.jobType === "report_generation" ? (
          <div className="space-y-3">
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>Title</FieldLabel>
              <input
                value={jobDraft.reportTitle}
                onChange={(event) => setJobDraft((current) => ({ ...current, reportTitle: event.target.value }))}
                className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="Weekly architecture report"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <FieldLabel>Format</FieldLabel>
                <select
                  value={jobDraft.reportFormat}
                  onChange={(event) =>
                    setJobDraft((current) => ({ ...current, reportFormat: event.target.value as "json" | "md" | "txt" }))
                  }
                  className="mt-1 w-full bg-transparent text-sm outline-none"
                >
                  <option value="json">json</option>
                  <option value="md">md</option>
                  <option value="txt">txt</option>
                </select>
              </label>
              <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <FieldLabel>Provider</FieldLabel>
                <select
                  value={jobDraft.reportProvider}
                  onChange={(event) =>
                    setJobDraft((current) => ({
                      ...current,
                      reportProvider: event.target.value as "template" | "openai" | "gemini",
                    }))
                  }
                  className="mt-1 w-full bg-transparent text-sm outline-none"
                >
                  <option value="template">template</option>
                  <option value="openai">openai</option>
                  <option value="gemini">gemini</option>
                </select>
              </label>
            </div>
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>Provider model</FieldLabel>
              <input
                value={jobDraft.reportProviderModel}
                onChange={(event) => setJobDraft((current) => ({ ...current, reportProviderModel: event.target.value }))}
                className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="Optional override"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>Summary</FieldLabel>
              <textarea
                value={jobDraft.reportSummary}
                onChange={(event) => setJobDraft((current) => ({ ...current, reportSummary: event.target.value }))}
                rows={3}
                className="mt-1 w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="Short executive summary"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>Sections</FieldLabel>
              <textarea
                value={jobDraft.reportSections}
                onChange={(event) => setJobDraft((current) => ({ ...current, reportSections: event.target.value }))}
                rows={7}
                className="mt-1 w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder={"Summary\nAll systems nominal.\n\nRisks\nOCR requires Tesseract on the worker host."}
              />
            </label>
          </div>
        ) : null}

        {jobDraft.jobType === "email_sending" ? (
          <div className="space-y-3">
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>To</FieldLabel>
              <input
                value={jobDraft.emailTo}
                onChange={(event) => setJobDraft((current) => ({ ...current, emailTo: event.target.value }))}
                className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="user@example.com"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>Subject</FieldLabel>
              <input
                value={jobDraft.emailSubject}
                onChange={(event) => setJobDraft((current) => ({ ...current, emailSubject: event.target.value }))}
                className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="Delivery update"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>Body</FieldLabel>
              <textarea
                value={jobDraft.emailBody}
                onChange={(event) => setJobDraft((current) => ({ ...current, emailBody: event.target.value }))}
                rows={4}
                className="mt-1 w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="Plain text message"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <FieldLabel>HTML (optional)</FieldLabel>
              <textarea
                value={jobDraft.emailHtml}
                onChange={(event) => setJobDraft((current) => ({ ...current, emailHtml: event.target.value }))}
                rows={4}
                className="mt-1 w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="<p><strong>Status</strong> update</p>"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={jobDraft.emailDryRun}
                onChange={(event) => setJobDraft((current) => ({ ...current, emailDryRun: event.target.checked }))}
              />
              Force dry-run artifact
            </label>
          </div>
        ) : null}

        <button
          disabled={opsBusy}
          onClick={submitJob}
          className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {opsBusy ? "Submitting..." : "Submit job"}
        </button>
      </div>
    </section>
  );
}
