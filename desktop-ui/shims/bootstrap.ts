"use client";

// Efeito colateral no carregamento do modulo (nao dentro de um componente)
// de proposito: o React dispara useEffect de filho ANTES do pai (ordem de
// baixo pra cima), entao se isso rodasse num useEffect la em cima da
// arvore, um componente filho (ex: DMSidebar) podia disparar seu proprio
// fetch antes do fetch global estar interceptado. Rodando aqui, na
// avaliacao do modulo, isso acontece antes de qualquer componente montar.
//
// O que faz: os componentes compartilhados (ver ../src/components/...) so
// sabem chamar fetch(apiUrl(caminho)) sem header nenhum -- no site, o
// cookie vai junto sozinho (mesma origem). Aqui a sessao e por token (ver
// shims/next-auth-react.tsx), entao toda chamada pra API precisa do
// "Authorization: Bearer <token>" -- em vez de editar cada chamada de novo,
// intercepta window.fetch uma vez so e injeta o header quando o endereco
// e da API remota.
if (typeof window !== "undefined" && !(window as unknown as { __gameshareFetchPatched?: boolean }).__gameshareFetchPatched) {
  (window as unknown as { __gameshareFetchPatched?: boolean }).__gameshareFetchPatched = true;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (apiBase && url.startsWith(apiBase)) {
      const token = await window.gameshareDesktop?.getAuthToken?.();
      if (token) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("Authorization", `Bearer ${token}`);
        return originalFetch(input, { ...init, headers });
      }
    }

    return originalFetch(input, init);
  };
}

export {};
