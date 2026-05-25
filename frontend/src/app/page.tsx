"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TOKEN_STORAGE_KEY = "queuely.accessToken";

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
    router.replace(token ? "/app" : "/login");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#02060b] text-zinc-200">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">Loading…</div>
    </main>
  );
}

