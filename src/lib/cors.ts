// CORS aplicado rota a rota, so nas que o app de desktop embutido realmente
// chama -- nunca uma mudanca geral (o middleware.ts nem intercepta
// /api/*, ver src/middleware.ts). Origem liberada de forma explicita via
// env var, nunca "*", porque essas rotas leem sessao/token de usuario de
// verdade.
const ALLOWED_ORIGIN = process.env.DESKTOP_APP_ORIGIN ?? "";

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGIN || origin !== ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

// Chama no fim de cada handler (GET/POST/...), sobre a resposta pronta,
// pra anexar os headers de CORS antes de devolver.
export function withCors<T extends Response>(request: Request, response: T): T {
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value);
  }
  return response;
}

// Handler pronto pra exportar como `OPTIONS` em rotas que usam CORS --
// responde o preflight que o navegador manda antes de um GET/POST
// cross-origin com header customizado (Authorization).
export function corsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
