// Tamanho maximo de uma sala de chamada de servidor. Acima disso, a malha
// P2P (cada pessoa conectada diretamente com todas as outras) pesa demais
// no upload de quem tem internet mais fraca -- 10 pessoas ja significa 9
// conexoes de saida simultaneas para cada uma. Nao se aplica a DM (sempre
// so 2 pessoas, sem risco de lotar).
export const MAX_CALL_ROOM_SIZE = 10;

// Uma presenca (ChannelPresence/DMPresence) sem heartbeat mais recente que
// isso conta como "nao esta mais na sala de verdade" -- aba fechada sem dar
// tempo do DELETE terminar, notebook que hibernou, etc. Usado tanto pra
// listar quem esta presente quanto pra contar vaga na sala.
export const PRESENCE_WINDOW_MS = 30_000;
