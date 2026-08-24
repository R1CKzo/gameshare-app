import type { Metadata } from "next";

import { Providers } from "@/components/Providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "GameShare",
  description: "Servidores para jogar e compartilhar sua tela ao vivo com a galera.",
};

// Aplica o tema salvo (se for "light") ANTES da hidratacao — sem isso,
// quem escolheu claro veria um flash de escuro (o padrao) toda vez que o
// app carrega, ate o React montar e o ThemeProvider corrigir. Roda direto
// no <head>, bloqueante de proposito, pra terminar antes da primeira
// pintura da pagina.
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem("gameshare-theme");
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-main font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
