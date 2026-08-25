"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import { ActiveCallAudioSink } from "@/components/call/ActiveCallAudioSink";
import { ActiveCallBar } from "@/components/call/ActiveCallBar";
import { ActiveCallProvider } from "@/components/call/ActiveCallProvider";
import { GlobalNotificationListener } from "@/components/notifications/GlobalNotificationListener";
import { PresenceProvider } from "@/components/notifications/PresenceProvider";
import { DesktopTitleBar } from "@/components/shell/DesktopTitleBar";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    // ThemeProvider e AccessibilityProvider ficam por fora de tudo —
    // funcionam ate na tela de login, que nao depende de sessao nenhuma.
    <ThemeProvider>
      <AccessibilityProvider>
        {/* refetchInterval faz o navegador reconsultar /api/auth/session
        sozinho a cada 60s (alem do padrao ja embutido do NextAuth de
        reconsultar ao focar a aba) — isso reemite o cookie de sessao com
        os dados atuais do banco (nickname, tag, isAdmin, se tem senha).
        Sem isso, so ficava fresco quando a propria acao que mudou o dado
        chamava update() manualmente (troca de nickname, definir senha) —
        qualquer outra mudanca (ex: editada direto no banco) so aparecia
        depois de sair e entrar de novo. */}
        <SessionProvider refetchInterval={60}>
          <GlobalNotificationListener>
            <PresenceProvider>
              <ActiveCallProvider>
                <DesktopTitleBar />
                {children}
                <ActiveCallBar />
                <ActiveCallAudioSink />
              </ActiveCallProvider>
            </PresenceProvider>
          </GlobalNotificationListener>
        </SessionProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}
