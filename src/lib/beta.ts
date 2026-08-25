// Interruptor global de "beta" (Configurações > Beta). Além de checar
// instalador novo do desktop pra baixar (ver checkBetaBuild em
// desktop.ts), esse mesmo interruptor libera funcionalidades novas que só
// existem no código do site (ex: áudio separado da transmissão em
// useVoiceMesh.ts) e que ainda não são pra rodar pra todo mundo -- ligado,
// já mostra as duas coisas. Só no localStorage desse navegador/computador,
// sem rota de API nem servidor envolvido.
export const BETA_STORAGE_KEY = "gameshare-allow-beta";

export function isBetaEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BETA_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
