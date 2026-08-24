"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SetupPage() {
  const router = useRouter();
  const { update } = useSession();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/user/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao definir nickname.");
        return;
      }

      // Forca o token/cookie de sessao a ser reemitido com o nickname novo
      // antes de navegar, senao o middleware ainda ve a sessao antiga e
      // manda o usuario de volta pro /setup.
      await update();

      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
      router.push(callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.20)_0%,rgba(34,211,238,0.08)_45%,transparent_70%)]" />

      <div className="relative w-full max-w-md rounded-[20px] border border-overlay-strong bg-surface p-10 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="mb-5 flex justify-center">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="M4.9 4.9l2.8 2.8" />
              <path d="M16.3 16.3l2.8 2.8" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <path d="M4.9 19.1l2.8-2.8" />
              <path d="M16.3 7.7l2.8-2.8" />
            </svg>
          </div>
        </div>

        <h1 className="text-center font-display text-2xl font-bold">Escolha seu nickname</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-muted">
          Você vai receber uma tag numérica única, assim ninguém te confunde com outro jogador.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label htmlFor="nickname" className="mb-2 block text-xs font-bold tracking-wide text-muted">
              NICKNAME
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="ex: shadowplayer"
              minLength={3}
              maxLength={16}
              pattern="[a-zA-Z0-9_]+"
              required
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-[15px] font-semibold outline-none focus:border-primary"
            />
            <p className="mt-1.5 text-xs text-dim">3-16 caracteres: letras, números ou underline.</p>
          </div>

          {nickname && (
            <div>
              <div className="mb-2 text-xs font-bold tracking-wide text-muted">PRÉ-VISUALIZAÇÃO</div>
              <div className="inline-flex items-center gap-0.5 rounded-full bg-elevated px-4 py-2">
                <span className="text-[15px] font-bold">{nickname}</span>
                <span className="text-[15px] font-bold text-accent">#??????</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="h-[50px] w-full rounded-xl bg-primary text-[15px] font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Confirmar e entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
