"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderUp, KanbanSquare, PlusCircle, ShieldCheck, LogOut } from "lucide-react";
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
  { href: "/ops", label: "Ops", icon: ShieldCheck },
];

export function AppShell({ title, subtitle, onSignOut }: { title: string; subtitle: string; onSignOut?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Queuely</div>
          <div className="mt-2 text-2xl font-semibold text-white">{title}</div>
          <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav className="mt-1 flex flex-1 flex-col gap-2 overflow-hidden">
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
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                        active
                          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                          : "border-white/10 bg-black/10 text-zinc-300 hover:bg-white/5"
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
      <SidebarFooter className="mt-auto">
        <Button
          variant="secondary"
          className="justify-start"
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
