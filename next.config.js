/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Camadas de seguranca no nivel HTTP, por cima das checagens que ja
  // existem em cada rota. Nao inclui Content-Security-Policy: o app usa
  // Pusher (WebSocket), PeerJS (sinalizacao + STUN/TURN) e o OAuth do
  // Google, e um CSP errado bloquearia uma dessas conexoes silenciosamente
  // — sem conseguir testar ao vivo com login de verdade, o risco de
  // quebrar a chamada de voz ou o login sem perceber e maior que o
  // beneficio de adicionar isso as cegas agora.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // A pagina nunca precisa rodar dentro de um <iframe> de outro
          // site — sem isso, um site malicioso podia te enganar clicando
          // em algo que parece ser dele mas e na verdade o GameShare por
          // baixo (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Impede o navegador de "adivinhar" o tipo de um arquivo
          // diferente do Content-Type declarado — fecha uma forma antiga
          // de disfarçar um arquivo malicioso de imagem/texto inofensivo.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // So manda a origem (nao a URL inteira, com token de convite ou
          // codigo de login por exemplo) pra sites de fora quando voce
          // clica num link que sai do GameShare.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Desliga acesso a camera/microfone/localizacao/etc pra
          // qualquer coisa embutida na pagina — o GameShare so usa
          // microfone/tela na propria origem, nunca precisa liberar isso
          // pra terceiros.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), interest-cohort=()" },
          // Forca HTTPS por 2 anos, inclusive em subdominios — sem isso,
          // a primeira visita por http:// (antes de qualquer redirect)
          // fica exposta a um ataque de rede no meio do caminho.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
