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
