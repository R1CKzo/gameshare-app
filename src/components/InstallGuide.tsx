// Passo a passo de instalação pra quem baixou o instalador do Windows,
// com destaque pro aviso do SmartScreen -- a duvida mais comum de quem
// baixa um app sem certificado digital pago (o instalador nao e
// malicioso, so nao tem selo nenhum ainda). So aparece pra quem acessa
// pelo navegador (ver .browser-only em globals.css).
export function InstallGuide() {
  return (
    <div className="browser-only mt-14 w-full max-w-2xl text-left">
      <h2 className="mb-6 text-center font-display text-lg font-bold text-foreground">Como instalar</h2>

      <ol className="space-y-5">
        <Step number={1} title="Baixe e abra o instalador">
          Clique em "Baixar para Windows" acima e execute o arquivo <code className="rounded bg-elevated px-1.5 py-0.5 text-xs">GameShare-Setup.exe</code> baixado.
        </Step>

        <Step number={2} title='O Windows vai avisar "protegeu seu PC" — é normal'>
          <p className="mb-3">
            O GameShare ainda não tem o certificado digital pago que a Microsoft exige pra sumir com esse aviso.
            O instalador é seguro, só clique em <strong className="text-foreground">"Mais informações"</strong> e
            depois em <strong className="text-foreground">"Executar assim mesmo"</strong>.
          </p>
          <SmartScreenMock />
        </Step>

        <Step number={3} title="Faça login e pronto">
          Abra o GameShare, entre com Google ou email e senha — a mesma conta desta página.
        </Step>
      </ol>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
        {number}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 text-sm font-bold text-foreground">{title}</div>
        <div className="text-[13px] leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

// Reconstrução ilustrativa do dialogo do Windows SmartScreen (não é uma
// captura de tela de verdade) -- só pra apontar exatamente onde clicar.
function SmartScreenMock() {
  return (
    <div className="max-w-sm overflow-hidden rounded-lg border border-border bg-[#1e1e1e] font-sans text-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#2b2b2b] px-3 py-2">
        <ShieldIcon />
        <span className="text-[12px] font-semibold">Windows protegeu seu PC</span>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-[12px] leading-snug text-white/85">
          O Microsoft Defender SmartScreen impediu a inicialização de um aplicativo não reconhecido. A execução
          desse aplicativo pode representar um risco pro seu PC.
        </p>
        <span className="mt-2.5 block text-[12px] font-semibold text-[#6db3f2] underline decoration-1 underline-offset-2">
          Mais informações
        </span>
        <div className="mt-3 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/60">
          Aplicativo: GameShare-Setup.exe
          <br />
          Editor: Editor desconhecido
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <span className="rounded-sm bg-[#3a3a3a] px-3.5 py-1.5 text-[12px] font-semibold text-white/70">
            Não executar
          </span>
          <span className="rounded-sm bg-[#0067c0] px-3.5 py-1.5 text-[12px] font-semibold text-white">
            Executar assim mesmo
          </span>
        </div>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" className="shrink-0">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
    </svg>
  );
}
