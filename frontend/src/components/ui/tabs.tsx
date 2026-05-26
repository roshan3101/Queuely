"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("inline-flex h-11 items-center rounded-xl border border-border bg-zinc-50 p-1 text-foreground dark:bg-zinc-900/30", className)} {...props} />;
}

function TabsTrigger({ className, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button className={cn("rounded-lg px-3 py-1.5 text-sm transition", active ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white", className)} {...props} />;
}

function TabsContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
