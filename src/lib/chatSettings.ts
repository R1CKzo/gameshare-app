// Preferencia "Enviar com Ctrl+Enter" (Configuracoes > Bate-papo). Mesmo
// padrao do resto (ver sound.ts, AvancadoTab): so localStorage, sem
// Context/Provider. Chave ausente = Enter envia (comportamento de
// sempre) -- so quem liga o interruptor muda pra Ctrl+Enter.
export const SEND_WITH_CTRL_ENTER_KEY = "gameshare-send-with-ctrl-enter";

export function sendsOnPlainEnter(): boolean {
  try {
    return localStorage.getItem(SEND_WITH_CTRL_ENTER_KEY) !== "true";
  } catch {
    return true;
  }
}
