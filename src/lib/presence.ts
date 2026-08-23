// Deriva o status visivel (online/ausente/offline) a partir do que o banco
// guarda (status + lastActiveAt) — "offline" nunca fica salvo, e so o que
// aparece quando o ultimo heartbeat (ver PresenceHeartbeat.tsx) e velho
// demais. A janela e 2x o intervalo de heartbeat (60s), pra tolerar um
// heartbeat atrasado sem piscar "offline" por engano.
export const HEARTBEAT_INTERVAL_MS = 60_000;
export const OFFLINE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 2;

export type RawStatus = "ONLINE" | "AWAY" | null | undefined;
export type PresenceStatus = "online" | "away" | "offline";

export function deriveStatus(status: RawStatus, lastActiveAt: string | Date | null | undefined): PresenceStatus {
  if (!lastActiveAt) return "offline";
  const lastMs = typeof lastActiveAt === "string" ? new Date(lastActiveAt).getTime() : lastActiveAt.getTime();
  if (Date.now() - lastMs > OFFLINE_AFTER_MS) return "offline";
  return status === "AWAY" ? "away" : "online";
}
