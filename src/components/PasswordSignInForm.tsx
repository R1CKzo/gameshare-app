"use client";

import { useState } from "react";

import { apiUrl } from "@/lib/apiUrl";

type Step = "credentials" | "code";
type Mode = "login" | "signup";

// Login/cadastro por email+senha, com o codigo de seguranca obrigatorio
// depois — usado tanto na pagina inicial quanto no desktop-login (Electron
// abre essa mesma pagina no navegador de verdade). Nao usa o
// CredentialsProvider do NextAuth: as rotas /api/auth/password/* montam a
// sessao na mao so depois do codigo confirmado, entao nunca existe cookie
// de sessao parcial no meio do caminho.
export function PasswordSignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const endpoint = mode === "login" ? "/api/auth/password/login" : "/api/auth/password/signup";
    const res = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível continuar.");
      return;
    }
    setTicketId(data.ticketId);
    setStep("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/auth/password/verify-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSending(false);
      setError(data.error ?? "Código inválido.");
      return;
    }
    // navegacao de verdade — o cookie ja foi setado pela resposta, isso
    // garante que tudo (sessao do next-auth, middleware) enxerga ele
    window.location.assign(callbackUrl ?? "/");
  }

  async function resendCode() {
    if (resendCooldown) return;
    setResendCooldown(true);
    setTimeout(() => setResendCooldown(false), 30_000);
    const res = await fetch(apiUrl("/api/auth/password/resend-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTicketId(data.ticketId);
      setError("");
    } else {
      setError(data.error ?? "Não foi possível reenviar.");
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="mt-6 w-full max-w-xs space-y-3">
        <p className="text-xs text-dim">Enviamos um código de 6 dígitos pro seu email. Confirme pra continuar.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          placeholder="000000"
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={sending || code.length !== 6}
          className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {sending ? "Confirmando..." : "Confirmar código"}
        </button>
        <button
          type="button"
          onClick={resendCode}
          disabled={resendCooldown}
          className="w-full text-center text-xs font-semibold text-muted transition hover:text-foreground-secondary disabled:opacity-50"
        >
          Reenviar código
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="mt-6 w-full max-w-xs space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Senha"
        className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={sending || !email || !password}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {sending ? "Enviando..." : mode === "login" ? "Entrar" : "Criar conta"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "login" ? "signup" : "login"));
          setError("");
        }}
        className="w-full text-center text-xs font-semibold text-muted transition hover:text-foreground-secondary"
      >
        {mode === "login" ? "Não tem conta? Criar" : "Já tem conta? Entrar"}
      </button>
    </form>
  );
}
