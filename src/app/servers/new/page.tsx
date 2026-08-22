"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewServerPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"create" | "join" | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("create");
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nao foi possivel criar o servidor.");
        return;
      }
      router.push(`/servers/${data.id}`);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("join");
    try {
      const res = await fetch("/api/servers/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nao foi possivel entrar no servidor.");
        return;
      }
      router.push(`/servers/${data.id}`);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.16)_0%,rgba(34,211,238,0.06)_45%,transparent_70%)]" />

      <div className="relative flex w-full max-w-md flex-col gap-5">
        <div className="rounded-[20px] border border-white/[0.07] bg-surface p-8 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
          <h1 className="font-display text-xl font-bold">Criar um servidor</h1>
          <p className="mt-1.5 text-sm text-muted">De um nome pro seu servidor e comece a jogar com a galera.</p>

          <form onSubmit={handleCreate} className="mt-6 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Arena Noturna"
              minLength={2}
              maxLength={40}
              required
              className="h-12 w-full rounded-xl border border-[#2d3344] bg-background px-4 text-[15px] outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading === "create"}
              className="h-12 w-full rounded-xl bg-primary text-[15px] font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
            >
              {loading === "create" ? "Criando..." : "Criar servidor"}
            </button>
          </form>
        </div>

        <div className="flex items-center gap-3 px-2 text-xs font-bold uppercase tracking-wider text-dim">
          <div className="h-px flex-1 bg-white/10" />
          ou
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="rounded-[20px] border border-white/[0.07] bg-surface p-8 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
          <h2 className="font-display text-lg font-bold">Entrar com um convite</h2>
          <p className="mt-1.5 text-sm text-muted">Cole o codigo de convite de um servidor existente.</p>

          <form onSubmit={handleJoin} className="mt-6 space-y-4">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="ex: 8f3k2p9q"
              required
              className="h-12 w-full rounded-xl border border-[#2d3344] bg-background px-4 text-[15px] outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={loading === "join"}
              className="h-12 w-full rounded-xl border border-[#2d3344] text-[15px] font-bold transition hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {loading === "join" ? "Entrando..." : "Entrar no servidor"}
            </button>
          </form>
        </div>

        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
