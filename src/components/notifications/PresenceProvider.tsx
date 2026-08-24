"use client";

import { useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { HEARTBEAT_INTERVAL_MS, IDLE_AFTER_MS, type PresenceStatus } from "@/lib/presence";

type ManualStatus = "ONLINE" | "AWAY" | "BUSY";

type PresenceContextValue = {
  // O que aparece na sua propria bolinha agora — automatico (foco da aba +
  // tempo parado) ou o valor fixado manualmente, o que valer no momento.
  effectiveStatus: PresenceStatus;
  manualStatus: ManualStatus | null;
  setManualStatus: (status: ManualStatus | null) => void;
};

const RAW_TO_DISPLAY: Record<ManualStatus, PresenceStatus> = { ONLINE: "online", AWAY: "away", BUSY: "busy" };

const PresenceContext = createContext<PresenceContextValue>({
  effectiveStatus: "online",
  manualStatus: null,
  setManualStatus: () => {},
});

export function usePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}

function computeAutoStatus(lastInteractionMs: number): "ONLINE" | "AWAY" {
  if (document.visibilityState !== "visible") return "AWAY";
  if (Date.now() - lastInteractionMs > IDLE_AFTER_MS) return "AWAY";
  return "ONLINE";
}

// Mantem o status de presenca (online/ausente/ocupado) atualizado e expoe
// ele pro resto do app via contexto (UserPill usa pra desenhar a bolinha e
// o menu de trocar manualmente). Sem fixar nada, o status e automatico:
// muda com o foco da aba e com ~5min parado sem mouse/teclado/toque —
// inclusive minimizado na bandeja do desktop, onde a pagina so fica
// "hidden", nunca suspensa de verdade.
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  const [manualStatus, setManualStatusState] = useState<ManualStatus | null>(null);
  const [autoStatus, setAutoStatus] = useState<"ONLINE" | "AWAY">("ONLINE");
  const manualRef = useRef<ManualStatus | null>(null);
  const lastInteractionRef = useRef(Date.now());
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    manualRef.current = manualStatus;
  }, [manualStatus]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    function sendHeartbeat() {
      let status: ManualStatus;
      if (manualRef.current) {
        status = manualRef.current;
      } else {
        status = computeAutoStatus(lastInteractionRef.current);
        setAutoStatus(status);
      }
      fetch("/api/me/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        keepalive: true,
      }).catch(() => {});
    }

    function markInteraction() {
      lastInteractionRef.current = Date.now();
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      // So agenda o proximo heartbeat "de virar ausente" se ninguem mais
      // fixou o status manualmente nesse meio tempo.
      idleTimeoutRef.current = setTimeout(() => {
        if (!manualRef.current) sendHeartbeat();
      }, IDLE_AFTER_MS);
    }

    fetch("/api/me/status")
      .then((r) => r.json())
      .then((data: { manual?: boolean; status?: ManualStatus | null }) => {
        if (cancelled) return;
        if (data.manual && data.status) setManualStatusState(data.status);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) sendHeartbeat();
      });

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, markInteraction, { passive: true }));
    document.addEventListener("visibilitychange", sendHeartbeat);
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    markInteraction();

    return () => {
      cancelled = true;
      events.forEach((e) => window.removeEventListener(e, markInteraction));
      document.removeEventListener("visibilitychange", sendHeartbeat);
      clearInterval(interval);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [userId]);

  async function setManualStatus(status: ManualStatus | null) {
    setManualStatusState(status);
    manualRef.current = status;
    lastInteractionRef.current = Date.now();
    try {
      await fetch("/api/me/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status ? { mode: "MANUAL", status } : { mode: "AUTO" }),
      });
    } catch {
      // ignora falha transitoria — o proximo heartbeat tenta de novo
    }
    let effective: ManualStatus;
    if (status) {
      effective = status;
    } else {
      effective = computeAutoStatus(lastInteractionRef.current);
      setAutoStatus(effective);
    }
    fetch("/api/me/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: effective }),
      keepalive: true,
    }).catch(() => {});
  }

  const effectiveStatus: PresenceStatus = manualStatus ? RAW_TO_DISPLAY[manualStatus] : autoStatus === "AWAY" ? "away" : "online";

  return (
    <PresenceContext.Provider value={{ effectiveStatus, manualStatus, setManualStatus }}>
      {children}
    </PresenceContext.Provider>
  );
}
