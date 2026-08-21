"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";

export function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="h-9 w-24 animate-pulse rounded-md bg-surface" />;
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn("google")}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
      >
        Entrar com Google
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {session.user.nickname && session.user.userTag && (
        <Link
          href="/stream/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          Transmitir
        </Link>
      )}

      <div className="flex items-center gap-2 text-sm text-slate-300">
        {session.user.image && (
          <Image
            src={session.user.image}
            alt={session.user.name ?? "avatar"}
            width={28}
            height={28}
            className="rounded-full"
          />
        )}
        <span>
          {session.user.nickname
            ? `${session.user.nickname}#${session.user.userTag}`
            : session.user.name}
        </span>
      </div>

      <button
        onClick={() => signOut()}
        className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-surface"
      >
        Sair
      </button>
    </div>
  );
}
