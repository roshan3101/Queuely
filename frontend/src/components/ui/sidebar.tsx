"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SidebarContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggle: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("Sidebar components must be used within SidebarProvider.");
  }
  return context;
}

export function SidebarProvider({ children, defaultOpen = true }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const value = React.useMemo(() => ({ open, setOpen, toggle: () => setOpen((current) => !current) }), [open]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { toggle } = useSidebar();

  return (
    <Button variant="ghost" size="icon" className={cn("h-10 w-10", className)} onClick={toggle} {...props}>
      <Menu className="h-4 w-4" />
    </Button>
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 flex-1", className)} {...props} />;
}

export function Sidebar({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { open } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex h-screen w-72 flex-col border-r border-white/10 bg-[#07111a] text-zinc-100 transition-transform duration-300 lg:static lg:z-auto lg:rounded-[28px] lg:border lg:bg-white/5 lg:backdrop-blur",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-0 flex-1 flex-col px-4", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("list-none", className)} {...props} />;
}

export function SidebarMenuButton({ className, asChild, ...props }: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost" className={cn("w-full justify-start rounded-2xl px-4 py-3 text-left", className)} {...props} />;
}
