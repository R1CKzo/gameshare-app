"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

import { HEARTBEAT_INTERVAL_MS } from "@/lib/presence";

function currentStatus(): "ONLINE" | "AWAY" {
  return document.visibilityState === "visible" ? "ONLINE" : "AWAY";
}

function sendHeartbeat() {
  fetch("/api/me/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: currentStatus() }),
    keepalive: true,
  }).catch(() => {});
}

// Mantem o status de presenca (online/ausente) atualizado: manda um
// heartbeat ao montar, de novo toda vez que a aba entra/sai de foco (pra
// virar "ausente" rapido pros outros, sem esperar o proximo ciclo), e a
// cada ~60s enquanto o app fica aberto — inclusive minimizado na bandeja do
// desktop, onde a pagina so fica "hidden", nunca suspensa de verdade.
export function PresenceHeartbeat() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    sendHeartbeat();
    document.addEventListener("visibilitychange", sendHeartbeat);
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", sendHeartbeat);
      clearInterval(interval);
    };
  }, [userId]);

  return null;
}
