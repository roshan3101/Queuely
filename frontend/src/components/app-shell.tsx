"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderUp, KanbanSquare, PlusCircle, ShieldCheck, LogOut, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks/new", label: "Add task", icon: PlusCircle },
  { href: "/jobs", label: "Jobs", icon: KanbanSquare },
  { href: "/files", label: "Files", icon: FolderUp },
  { href: "/sessions", label: "AI Sessions", icon: MessageSquare },
  { href: "/ops", label: "Ops", icon: ShieldCheck },
];

export function AppShell({ title, subtitle, onSignOut }: { title: string; subtitle: string; onSignOut?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sidebar className="border-r border-border bg-card shadow-sm">
      <SidebarHeader>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">Queuely Platform</div>
          <div className="mt-1.5 text-xl font-bold font-mono tracking-tight uppercase text-foreground">{title}</div>
          <p className="mt-1 text-xs text-zinc-500 font-mono leading-normal">{subtitle}</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav className="mt-3 flex flex-1 flex-col gap-1.5 overflow-hidden">
          <SidebarMenu>
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition",
                        active
                          ? "border-cyan-400/40 bg-cyan-50 text-foreground dark:bg-cyan-400/10"
                          : "border-transparent text-zinc-500 hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="mt-auto flex flex-col gap-2">
        <Button
          variant="secondary"
          className="justify-start border border-border bg-card text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900"
          onClick={() => {
            const isDark = document.documentElement.classList.toggle("dark");
            localStorage.setItem("theme", isDark ? "dark" : "light");
          }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
          Toggle Theme
        </Button>
        <Button
          variant="secondary"
          className="justify-start border border-border bg-card text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900"
          onClick={() => {
            onSignOut?.();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
