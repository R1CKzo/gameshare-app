"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { SettingsButton } from "@/components/shell/SettingsButton";
import { SignOutButton } from "@/components/shell/SignOutButton";

export function UserPill({
  user,
}: {
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const { data: session } = useSession();

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-t border-white/[0.06] bg-black/20 px-2">
      <div className="relative">
        {user.image ? (
          <Image src={user.image} alt="" width={34} height={34} className="rounded-full" />
        ) : (
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary font-display text-[13px] font-bold">
            {user.nickname?.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#0a0b11] bg-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-[#f5f5f7]">{user.nickname}</div>
        <div className="text-[11px] text-muted">#{user.userTag}</div>
      </div>
      <a
        href="https://github.com/R1CKzo/gameshare-app/releases/latest/download/GameShare-Setup.exe"
        target="_blank"
        rel="noopener noreferrer"
        title="Baixar app para Windows"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      </a>
      {session?.user?.isAdmin && (
        <Link
          href="/admin/bugs"
          title="Bugs reportados"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
        >
          <BugIcon />
        </Link>
      )}
      <SettingsButton />
      <SignOutButton />
    </div>
  );
}

function BugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M12 2v4M8 13H2M22 13h-6" />
    </svg>
  );
}
