import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LandingPage callbackUrl={searchParams.callbackUrl} />;
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

function LandingPage({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.20)_0%,rgba(34,211,238,0.08)_45%,transparent_70%)]" />

      <div className="relative flex flex-col items-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M4.9 4.9l2.8 2.8" />
            <path d="M16.3 16.3l2.8 2.8" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <path d="M4.9 19.1l2.8-2.8" />
            <path d="M16.3 7.7l2.8-2.8" />
          </svg>
        </div>

        <h1 className="font-display text-3xl font-bold">
          Game<span className="text-primary">Share</span>
        </h1>
        <p className="mt-3 max-w-sm text-[15px] text-muted">
          Servidores para jogar com a galera. Entre numa sala e compartilhe sua tela ao vivo, sem
          precisar de outro app.
        </p>

        <GoogleSignInButton
          callbackUrl={callbackUrl}
          className="mt-8 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
        />

        <a
          href="https://github.com/R1CKzo/gameshare-app/releases/latest/download/GameShare-Setup.exe"
          className="mt-3 flex items-center gap-2 rounded-full border border-[#2d3344] px-6 py-3 text-sm font-bold text-[#d5d7dc] transition hover:border-primary hover:text-[#f5f5f7]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
          </svg>
          Baixar para Windows
        </a>
        <p className="mt-2 text-xs text-dim">Cliente de desktop, igual o Discord. Verifica atualizacoes sozinho.</p>
      </div>
    </div>
  );
}
