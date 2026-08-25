// Interruptor global de "beta" (Configurações > Beta). Sem instalador nem
// download separado nenhum -- esse unico interruptor libera acesso a
// RECURSOS que ainda estao em teste, dentro do app normal de sempre (ex:
// áudio separado da transmissao em useVoiceMesh.ts, quando ainda nao era
// oficial). Ligar/desligar pede reinicio pra aplicar (ver BetaTab em
// SettingsButton.tsx e restartAppOrReload em desktop.ts). Só no
// localStorage desse navegador/computador, sem rota de API nem servidor
// envolvido.
export const BETA_STORAGE_KEY = "gameshare-allow-beta";

export function isBetaEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BETA_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const LAST_SEEN_VERSION_KEY = "gameshare-last-seen-version";

// Toda vez que o app de desktop abre numa versao ESTAVEL (sem "-beta" no
// nome) diferente da ultima vista, desliga o interruptor de beta sozinho.
// Motivo: quando algo que estava em teste vira oficial (ou chega qualquer
// atualizacao estavel nova), ninguem deve continuar "preso" no modo beta
// sem ter escolhido de novo -- a proxima rodada de teste precisa ser
// ligada na mao, sempre. So chamado com a versao do instalador (string
// vazia no navegador comum, onde isso nao se aplica -- ver getAppVersion
// em desktop.ts).
export function resetBetaIfStableVersionChanged(currentVersion: string): void {
  if (typeof window === "undefined" || !currentVersion || currentVersion.includes("beta")) return;
  try {
    const lastSeen = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
    // lastSeen === null e a primeira vez que isso roda nesse computador --
    // nao e uma atualizacao de verdade, so nao tem base pra comparar ainda.
    if (lastSeen !== null && lastSeen !== currentVersion) {
      window.localStorage.setItem(BETA_STORAGE_KEY, "false");
    }
  } catch {
    // localStorage indisponivel (modo privado, etc) -- sem problema, so
    // nao reseta dessa vez
  }
}
