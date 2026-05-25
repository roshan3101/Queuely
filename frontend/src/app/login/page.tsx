"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { writeTokens } from "../../lib/authStorage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ApiResponse<T> = { success: boolean; data: T };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 3 && password.length >= 8, [email, password]);

  async function submit() {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const payload = (await resp.json()) as ApiResponse<{ tokens: { access_token: string; refresh_token: string } }>;
      writeTokens({ accessToken: payload.data.tokens.access_token, refreshToken: payload.data.tokens.refresh_token });
      router.replace("/app");
      // Ensure navigation even if the router transition is interrupted (e.g. stale state / extensions).
      window.setTimeout(() => {
        window.location.replace("/app");
      }, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#02060b] px-4 text-zinc-100">
      <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/10 backdrop-blur">
        <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Queuely</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-400">Login to the dashboard.</p>

        <div className="mt-5 grid gap-3">
          <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600" placeholder="you@example.com" />
          </label>
          <label className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <span className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600" placeholder="min 8 chars" />
          </label>
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div> : null}

          <div className="flex items-center justify-between gap-3">
            <a href="/signup" className="text-sm text-zinc-300 underline decoration-white/20 underline-offset-4 hover:text-white">
              Create account
            </a>
            <button onClick={() => void submit()} disabled={!canSubmit || busy} className="h-11 rounded-2xl bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
