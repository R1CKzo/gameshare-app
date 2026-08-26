// Uma foto de perfil enviada por upload (ver /api/user/profile) fica
// guardada no banco como uma data URL em base64, que pode chegar a varios
// KB — grande demais pra colar direto dentro do token de sessao (JWT vira
// cookie, e cookies tem limite de ~4KB por navegador; um token maior que
// isso e descartado em silencio, sem erro nenhum, e a pessoa parece
// "logar" mas nunca fica de verdade logada). Uma foto do Google, por outro
// lado, e sempre uma URL curta (https://lh3.googleusercontent.com/...) —
// essa pode ir direto no token sem problema.
//
// Pra contornar isso sem tirar a foto de ninguem: dentro do token/sessao,
// uma data URL vira uma referencia curta (/api/me/avatar), que o proprio
// app resolve de volta pra imagem de verdade na hora de exibir (ver essa
// rota). Fora do token — no banco, e na resposta de /api/user/profile logo
// apos o upload — a imagem continua sendo guardada/devolvida inteira.
import { apiUrl } from "@/lib/apiUrl";

export function sessionSafeImage(image: string | null): string | null {
  if (!image) return null;
  return image.startsWith("data:") ? apiUrl("/api/me/avatar") : image;
}

// Mesma ideia do sessionSafeImage acima, so que pra devolver a foto de
// QUALQUER usuario (nao so o da propria sessao) nas respostas de API --
// mensagens, presenca de chamada, lista de amigos, membros do servidor,
// etc. Antes, essas 10+ rotas devolviam o campo "image" cru do Prisma: uma
// foto por upload sai como data URL em base64 (varios KB de texto), e como
// isso ia dentro de CADA mensagem/presenca/membro da resposta, uma rota
// consultada com frequencia (ex: presenca de chamada, a cada 10s -- ver
// ChannelSidebar.tsx) reenviava os mesmos KBs repetidos sem parar, inflando
// rapido a transferencia de rede do banco (Neon). Igual ao token de sessao,
// so o link curto sai daqui -- a foto de verdade continua guardada inteira
// no banco, so nao trafega em toda resposta.
export function publicUserImage(userId: string, image: string | null): string | null {
  if (!image) return null;
  return image.startsWith("data:") ? apiUrl(`/api/users/${userId}/avatar`) : image;
}

// Gemeo do publicUserImage acima, pro icone de SERVIDOR (dono tambem pode
// enviar um por upload, mesmo formato data URL -- ver PATCH em
// /api/servers/[serverId]).
export function publicServerImage(serverId: string, image: string | null): string | null {
  if (!image) return null;
  return image.startsWith("data:") ? apiUrl(`/api/servers/${serverId}/icon`) : image;
}
