import Image from "next/image";

type Member = { id: string; nickname: string | null; userTag: string | null; image: string | null };

export function MemberList({ members }: { members: Member[] }) {
  return (
    <div className="hidden w-[228px] shrink-0 flex-col border-l border-white/[0.06] bg-sidebar p-3 lg:flex">
      <div className="px-2 pb-2 pt-1 text-[11px] font-bold tracking-wider text-muted">
        MEMBROS — {members.length}
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary">
              {member.image ? (
                <Image src={member.image} alt="" fill sizes="32px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">
                  {(member.nickname ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#f5f5f7]">{member.nickname}</div>
              <div className="truncate text-xs text-muted">#{member.userTag}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
