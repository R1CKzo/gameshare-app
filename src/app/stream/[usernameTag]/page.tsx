import Image from "next/image";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { parseUserTag } from "@/utils/generateTag";
import { StreamPlayer } from "@/components/StreamPlayer";

export const dynamic = "force-dynamic";

export default async function StreamPage({ params }: { params: { usernameTag: string } }) {
  const parsed = parseUserTag(params.usernameTag);
  if (!parsed) notFound();

  const user = await prisma.user.findUnique({
    where: {
      nickname_userTag: { nickname: parsed.nickname, userTag: parsed.userTag },
    },
    select: {
      name: true,
      image: true,
      nickname: true,
      userTag: true,
      stream: { select: { title: true, isLive: true, peerId: true } },
    },
  });

  if (!user) notFound();

  const usernameTag = `${user.nickname}#${user.userTag}`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        {user.image && (
          <Image src={user.image} alt={usernameTag} width={40} height={40} className="rounded-full" />
        )}
        <div>
          <h1 className="text-xl font-bold text-white">
            {user.stream?.title ?? `Canal de ${user.nickname}`}
          </h1>
          <p className="text-sm text-slate-400">{usernameTag}</p>
        </div>
        {user.stream?.isLive && (
          <span className="ml-auto rounded bg-danger px-2 py-1 text-xs font-medium text-white">
            AO VIVO
          </span>
        )}
      </div>

      <StreamPlayer peerId={user.stream?.peerId ?? null} isLive={Boolean(user.stream?.isLive)} />
    </div>
  );
}
