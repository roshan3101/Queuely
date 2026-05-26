"use client";

import { X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const variantStyles: Record<string, string> = {
  default: "border-white/10 bg-slate-950/95 text-zinc-100",
  info: "border-cyan-400/30 bg-cyan-500/15 text-cyan-50",
  success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-50",
  warning: "border-amber-400/30 bg-amber-500/15 text-amber-50",
  error: "border-rose-400/30 bg-rose-500/15 text-rose-50",
};

export function Toaster() {
  const { toasts, dismissToast } = useToast();

  return (
    <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-3 px-4 sm:px-0">
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={cn(
            "pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur",
            variantStyles[toast.variant] ?? variantStyles.default,
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.description ? <div className="mt-1 text-sm/6 text-white/80">{toast.description}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded-full border border-white/10 bg-white/5 p-1 text-current transition hover:bg-white/10"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
