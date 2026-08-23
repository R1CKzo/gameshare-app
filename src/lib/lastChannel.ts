// Lembra o ultimo canal visitado de cada servidor, pra ServerRail poder
// linkar direto pro canal (pulando a pagina de redirecionamento
// /servers/[serverId], que faz uma consulta extra e reinicia o fade) da
// segunda visita em diante.
function storageKey(serverId: string): string {
  return `gs:lastChannel:${serverId}`;
}

export function getLastChannel(serverId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(serverId));
  } catch {
    return null;
  }
}

export function setLastChannel(serverId: string, channelId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(serverId), channelId);
  } catch {
    // ignora falha (ex: storage cheio/bloqueado) — nao e critico
  }
}
