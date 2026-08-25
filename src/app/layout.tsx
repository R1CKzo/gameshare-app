import type { Metadata } from "next";

import { Providers } from "@/components/Providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "GameShare",
  description: "Servidores para jogar e compartilhar sua tela ao vivo com a galera.",
};

// Aplica o tema salvo (se for "light") ANTES da hidratacao — sem isso,
// quem escolheu claro veria um flash de escuro (o padrao) toda vez que o
// app carrega, ate o React montar e o ThemeProvider corrigir. Tambem
// aplica as escolhas de Acessibilidade (tamanho do texto, reduzir
// movimento, alto contraste — ver AccessibilityProvider.tsx) pelo mesmo
// motivo. Roda direto no <head>, bloqueante de proposito, pra terminar
// antes da primeira pintura da pagina.
//
// Tambem liga os atributos dos dois recursos em beta de interface (ver
// project state): "data-beta-ui" pra barra de rolagem customizada
// (globals.css) e "--titlebar-h"/"data-desktop-titlebar" pro caso da
// janela do app de desktop ter nascido sem moldura nativa nesse boot (ver
// createWindow em desktop/main.js e DesktopTitleBar.tsx) — as telas do app
// (AppShell, FriendsShell, etc) descontam essa variavel da propria altura
// pra nao ficar cortadas embaixo da janela. Roda aqui, cedo, pelo mesmo
// motivo do tema: sem isso a altura mudaria depois da primeira pintura.
// "gameshare-allow-beta" tem que bater com BETA_STORAGE_KEY (src/lib/beta.ts).
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem("gameshare-theme");
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    if (localStorage.getItem("gameshare-glass") === "true") document.documentElement.setAttribute("data-glass", "true");
    var textSize = localStorage.getItem("gameshare-text-size");
    if (textSize === "small" || textSize === "large") document.documentElement.setAttribute("data-text-size", textSize);
    if (localStorage.getItem("gameshare-reduce-motion") === "true") document.documentElement.setAttribute("data-reduce-motion", "true");
    if (localStorage.getItem("gameshare-high-contrast") === "true") document.documentElement.setAttribute("data-high-contrast", "true");
  } catch (e) {}
  try {
    var betaOn = localStorage.getItem("gameshare-allow-beta") === "true";
    if (betaOn) document.documentElement.setAttribute("data-beta-ui", "true");
    var isDesktop = typeof window !== "undefined" && window.gameshareDesktop && window.gameshareDesktop.isDesktop === true;
    if (betaOn && isDesktop) {
      document.documentElement.style.setProperty("--titlebar-h", "36px");
      document.documentElement.setAttribute("data-desktop-titlebar", "true");
    }
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
