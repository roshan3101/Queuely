"use client";

import { useMemo, useEffect } from "react";
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
  "/sessions": { title: "AI Sessions", subtitle: "Conversational RAG debug engine using pgvector memory context" },
  "/ops": { title: "Ops", subtitle: "Queues, workers, dead letters, and rate limits" },
};

function getRouteMeta(pathname: string) {
  if (pathname.startsWith("/tasks")) return routeMeta["/tasks/new"];
  if (pathname.startsWith("/jobs")) return routeMeta["/jobs"];
  if (pathname.startsWith("/files")) return routeMeta["/files"];
  if (pathname.startsWith("/sessions")) return routeMeta["/sessions"];
  if (pathname.startsWith("/ops")) return routeMeta["/ops"];
  return routeMeta["/dashboard"];
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Restore theme from localStorage or system preferences
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const shell = useMemo(() => {
    const isPublicRoute = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup");
    if (isPublicRoute) {
      return children;
    }

    const meta = getRouteMeta(pathname);
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="min-h-screen w-full bg-background text-foreground transition-colors duration-200">
          {/* Persistent Fixed Left Sidebar */}
          <AppShell title={meta.title} subtitle={meta.subtitle} onSignOut={clearTokens} />
          
          {/* Main content pane offset by sidebar width on desktop */}
          <div className="lg:pl-72 min-h-screen flex flex-col w-full">
            <SidebarInset className="flex-1 flex flex-col gap-6 p-4 lg:p-8 max-w-5xl w-full mx-auto">
              <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 lg:hidden">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Queuely Platform</div>
                  <div className="mt-1 text-lg font-bold font-mono tracking-tight uppercase text-foreground">{meta.title}</div>
                  <p className="mt-0.5 text-xs text-zinc-500 font-mono leading-normal">{meta.subtitle}</p>
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
