"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
    <main className="min-h-screen bg-[#02060b] px-4 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center py-10">
        <Card className="w-full max-w-lg border-white/10 bg-white/5 shadow-2xl shadow-cyan-950/10">
          <CardHeader>
            <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Queuely</div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Login to the dashboard and open your sessions, jobs, and ops tools.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars" />
            </div>
            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div> : null}
            <div className="flex items-center justify-between gap-3">
              <Link href="/signup" className="text-sm text-zinc-300 underline decoration-white/20 underline-offset-4 hover:text-white">Create account</Link>
              <Button onClick={() => void submit()} disabled={!canSubmit || busy}>{busy ? "Signing in..." : "Sign in"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
