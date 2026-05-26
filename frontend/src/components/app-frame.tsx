"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { clearTokens } from "@/lib/authStorage";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const routeMeta: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Task metrics and system health" },
  "/tasks": { title: "Add task", subtitle: "Upload a file, choose a task, and run it immediately" },
  "/tasks/new": { title: "Add task", subtitle: "Upload a file, choose a task, and run it immediately" },
  "/jobs": { title: "Jobs", subtitle: "Queue history and current state" },
  "/files": { title: "Files", subtitle: "Upload source files and manage indexed context" },
  "/ops": { title: "Ops", subtitle: "Queues, workers, dead letters, and rate limits" },
};

function getRouteMeta(pathname: string) {
  if (pathname.startsWith("/tasks")) return routeMeta["/tasks/new"];
  if (pathname.startsWith("/jobs")) return routeMeta["/jobs"];
  if (pathname.startsWith("/files")) return routeMeta["/files"];
  if (pathname.startsWith("/ops")) return routeMeta["/ops"];
  return routeMeta["/dashboard"];
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const shell = useMemo(() => {
    const isPublicRoute = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup");
    if (isPublicRoute) {
      return children;
    }

    const meta = getRouteMeta(pathname);
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="min-h-screen overflow-x-hidden bg-[#02060b] text-zinc-100">
          <div className="mx-auto flex min-h-screen w-full max-w-400 gap-5 p-4 lg:p-6">
            <AppShell title={meta.title} subtitle={meta.subtitle} onSignOut={clearTokens} />
            <SidebarInset className="flex min-w-0 flex-1 flex-col gap-5">
              <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur lg:hidden">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Queuely</div>
                  <div className="mt-2 text-xl font-semibold text-white">{meta.title}</div>
                  <p className="mt-1 text-sm text-zinc-400">{meta.subtitle}</p>
                </div>
                <SidebarTrigger />
              </div>
              {children}
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    );
  }, [children, pathname]);

  return (
    <ToastProvider>
      {shell}
      <Toaster />
    </ToastProvider>
  );
}
