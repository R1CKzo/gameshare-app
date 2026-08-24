// Ponto unico pra montar o endereco de uma chamada a API. Hoje sempre
// relativo (a interface roda na mesma origem da API, seja no navegador ou
// no app de desktop atual, que so carrega a pagina ao vivo). O app de
// desktop embutido (ver plano de app nativo) vai rodar numa origem
// diferente e precisa apontar pro backend de verdade — sem
// NEXT_PUBLIC_API_BASE_URL configurado, o comportamento fica identico ao
// de hoje.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
