import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DesktopDownloadLink } from "@/components/DesktopDownloadLink";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
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

        {error === "OAuthAccountNotLinked" && (
          <p className="mt-4 max-w-sm rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-2.5 text-sm text-danger">
            Esse email já tem uma conta com senha — faça login com email e senha em vez do Google.
          </p>
        )}

        <GoogleSignInButton
          callbackUrl={callbackUrl}
          className="mt-8 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
        />

        <div className="mt-4 flex items-center gap-3 text-xs text-dim">
          <div className="h-px w-12 bg-white/10" />
          ou
          <div className="h-px w-12 bg-white/10" />
        </div>

        <PasswordSignInForm callbackUrl={callbackUrl} />

        <DesktopDownloadLink />
      </div>
    </div>
  );
}
