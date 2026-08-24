"use client";

import { useEffect, useState } from "react";

import { getAppVersion, isDesktopApp } from "@/lib/desktop";

// "beta" so quando o deploy é mesmo o do branch beta (ver
// NEXT_PUBLIC_APP_CHANNEL, configurado só nesse ambiente na Vercel) —
// production nunca define essa variável, então o padrão é sempre
// "estável". Funciona tanto pelo navegador comum quanto pelo app de
// desktop, já que é uma propriedade do próprio site carregado, não do
// instalador.
const CHANNEL = process.env.NEXT_PUBLIC_APP_CHANNEL === "beta" ? "beta" : "stable";

// Selo pequeno mostrando em qual trilha (e versão do instalador, quando
// disponível) a pessoa está — pra nunca ficar em dúvida se está vendo o
// site oficial ou o de testes.
export function ChannelBadge() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (isDesktopApp()) getAppVersion().then(setVersion);
  }, []);

  if (CHANNEL === "beta") {
    return (
      <span
        title={version ? `App de desktop v${version} · trilha beta` : "Trilha beta"}
        className="inline-flex shrink-0 items-center rounded-full bg-accent/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-accent"
      >
        Beta{version ? ` · v${version}` : ""}
      </span>
    );
  }

  if (!version) return null;

  return (
    <span title="App de desktop, trilha estável" className="shrink-0 text-[10px] text-dim">
      v{version}
    </span>
  );
}
