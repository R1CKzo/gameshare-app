"use client";

import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/apiUrl";

export type ParentalAction = "JOIN_SERVER" | "ACCEPT_FRIEND";

// Modal generico de autorizacao parental: pede o codigo de
// /api/parental/authorize-request assim que monta, mostra o campo de
// codigo, e so chama onSuccess() depois que
// /api/parental/authorize-confirm de fato executar a acao (entrar no
// servidor ou aceitar o pedido de amizade) -- ver esses dois arquivos e
// src/lib/serverJoin.ts / src/lib/friendAccept.ts.
export function ParentalCodeModal({
  action,
  targetId,
  onSuccess,
  onCancel,
}: {
  action: ParentalAction;
  targetId: string;
  onSuccess: (result: { serverId?: string }) => void;
  onCancel: () => void;
}) {
  const [ticketId, setTicketId] = useState("");
  const [code, setCode] = useState("");
  const [requesting, setRequesting] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(apiUrl("/api/parental/authorize-request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setRequesting(false);
      if (!res.ok) {
        setError(data.error ?? "Não foi possível pedir autorização.");
        return;
      }
      setTicketId(data.ticketId);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/parental/authorize-confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, code }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Código inválido.");
      return;
    }
    onSuccess(data);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-overlay-strong bg-surface p-5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="mb-1 font-display text-lg font-bold">Autorização dos pais necessária</h2>
        <p className="mb-4 text-xs text-dim">
          Essa conta tem controle parental ativo — {action === "JOIN_SERVER" ? "entrar nesse servidor" : "aceitar esse pedido de amizade"}{" "}
          precisa da autorização do seu responsável.
        </p>

        {requesting ? (
          <p className="text-sm text-dim">Enviando pedido de autorização pro email do responsável...</p>
        ) : (
          <form onSubmit={confirm} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold tracking-wide text-muted">
                CÓDIGO ENVIADO PRO EMAIL DO RESPONSÁVEL
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                autoFocus
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
              />
              <p className="mt-1.5 text-xs text-dim">Peça pro seu responsável o código que chegou no email dele.</p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="h-11 flex-1 rounded-xl text-sm font-bold text-muted transition hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sending || code.length !== 6 || !ticketId}
                className="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                {sending ? "Confirmando..." : "Confirmar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
