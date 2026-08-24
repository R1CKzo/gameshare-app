import { getServerSession } from "next-auth";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { PasswordSignInForm } from "@/components/PasswordSignInForm";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Pagina que o app de desktop abre no navegador de verdade do usuario (o
// Google bloqueia o login do Google dentro da janela embutida do
// Electron). Sem sessao, mostra o botao de login normal; com sessao,
// marca esse codigo como "pertence a este usuario" pra o app de desktop
// (que fica consultando /api/desktop-login/[code]) perceber e continuar
// sozinho.
export default async function DesktopLoginPage({ params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold">Entrar no GameShare</h1>
        <p className="mt-3 max-w-sm text-[15px] text-muted">
          Faça login pra continuar no aplicativo de desktop.
        </p>
        <GoogleSignInButton
          callbackUrl={`/desktop-login/${params.code}`}
          className="mt-8 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
        />

        <div className="mt-4 flex items-center gap-3 text-xs text-dim">
          <div className="h-px w-12 bg-white/10" />
          ou
          <div className="h-px w-12 bg-white/10" />
        </div>

        <PasswordSignInForm callbackUrl={`/desktop-login/${params.code}`} />
      </Shell>
    );
  }

  await prisma.desktopLoginRequest.upsert({
    where: { code: params.code },
    create: { code: params.code, userId: session.user.id },
    update: { userId: session.user.id },
  });

  return (
    <Shell>
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h1 className="font-display text-2xl font-bold">Login concluído</h1>
      <p className="mt-3 max-w-sm text-[15px] text-muted">
        Pode voltar pro aplicativo do GameShare — ele vai continuar sozinho. Essa aba já pode ser fechada.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.20)_0%,rgba(34,211,238,0.08)_45%,transparent_70%)]" />
      <div className="relative flex flex-col items-center text-center">{children}</div>
    </div>
  );
}
