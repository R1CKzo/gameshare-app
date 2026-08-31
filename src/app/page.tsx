import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { GameShareMark } from "@/components/GameShareMark";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { InstallGuide } from "@/components/InstallGuide";
import { PasswordSignInForm } from "@/components/PasswordSignInForm";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LandingPage callbackUrl={searchParams.callbackUrl} error={searchParams.error} />;
  }

  if (!session.user.nickname || !session.user.userTag) {
    redirect("/setup");
  }

  const membership = await prisma.serverMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { serverId: true },
  });

  if (membership) {
    redirect(`/servers/${membership.serverId}`);
  }

  redirect("/servers/new");
}

function LandingPage({ callbackUrl, error }: { callbackUrl?: string; error?: string }) {
  return (
    <div className="relative flex min-h-[calc(100dvh_-_var(--titlebar-h,0px))] flex-col items-center overflow-hidden bg-background px-4 py-16">
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.20)_0%,rgba(34,211,238,0.08)_45%,transparent_70%)]" />

      <div className="relative flex flex-col items-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent">
          <GameShareMark size={28} className="text-white" />
        </div>

        <h1 className="font-display text-3xl font-bold">
          Game<span className="text-primary">Share</span>
        </h1>
        <p className="mt-3 max-w-sm text-[15px] text-muted">
          Servidores para jogar com a galera. Entre numa sala e compartilhe sua tela ao vivo, sem
          precisar de outro app.
        </p>

        {error === "OAuthAccountNotLinked" && (
          <p className="mt-4 max-w-sm rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-2.5 text-sm text-danger">
            Esse email já tem uma conta com senha — faça login com email e senha em vez do Google.
          </p>
        )}

        {/* So pra quem esta no navegador -- quem ja esta dentro do app de
        desktop nao precisa baixar/instalar o proprio app que ja esta
        usando (ver .browser-only em globals.css). */}
        <a
          href="https://github.com/R1CKzo/gameshare-app/releases/latest/download/GameShare-Setup.exe"
          className="browser-only mt-8 flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Baixar para Windows
        </a>
        <p className="browser-only mt-2 text-xs text-dim">Cliente de desktop, igual o Discord. Verifica atualizações sozinho.</p>

        <div className="mt-8 flex items-center gap-3 text-xs text-dim">
          <div className="h-px w-12 bg-white/10" />
          ou entre pelo navegador
          <div className="h-px w-12 bg-white/10" />
        </div>

        <GoogleSignInButton
          callbackUrl={callbackUrl}
          className="mt-5 rounded-full border border-border px-7 py-3.5 text-[15px] font-bold text-foreground-secondary transition hover:border-primary hover:text-foreground"
        />

        <div className="mt-4 flex items-center gap-3 text-xs text-dim">
          <div className="h-px w-12 bg-white/10" />
          ou
          <div className="h-px w-12 bg-white/10" />
        </div>

        <PasswordSignInForm callbackUrl={callbackUrl} />
      </div>

      <InstallGuide />
    </div>
  );
}
