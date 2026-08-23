"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";

import { MoreMenu } from "@/components/shell/MoreMenu";
import { SettingsButton } from "@/components/shell/SettingsButton";

export function UserPill({
  user,
}: {
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const { data: session } = useSession();
  const label = user.nickname ?? "Alguem";

  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-t border-white/[0.06] bg-black/20 px-3">
      <div className="relative shrink-0">
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={36}
            height={36}
            className="rounded-full ring-1 ring-white/[0.08]"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display text-[13px] font-bold ring-1 ring-white/[0.08]">
            {label.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#0a0b11] bg-accent" />
      </div>

      <div className="min-w-0 flex-1">
        <div title={label} className="truncate text-[13.5px] font-bold leading-tight text-[#f5f5f7]">
          {label}
        </div>
        <div className="truncate text-[11px] font-medium leading-tight text-muted">#{user.userTag}</div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <SettingsButton />
        <MoreMenu isAdmin={session?.user?.isAdmin ?? false} />
      </div>
    </div>
  );
}
