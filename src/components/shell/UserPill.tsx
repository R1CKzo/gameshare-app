"use client";

import Image from "next/image";

import { SettingsButton } from "@/components/shell/SettingsButton";
import { SignOutButton } from "@/components/shell/SignOutButton";

export function UserPill({
  user,
}: {
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
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
      <SettingsButton />
      <SignOutButton />
    </div>
  );
}
