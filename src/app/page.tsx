import Image from "next/image";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const liveStreams = await prisma.stream.findMany({
    where: { isLive: true },
    orderBy: { updatedAt: "desc" },
    select: {
      title: true,
      user: { select: { nickname: true, userTag: true, image: true, name: true } },
    },
  });

  return (
    <div>
      <section className="mb-10">
        <h1 className="text-3xl font-bold text-white">Lives agora</h1>
        <p className="mt-1 text-slate-400">
          Assista quem esta jogando ao vivo ou inicie sua propria transmissao.
        </p>
      </section>

      {liveStreams.length === 0 ? (
        <p className="text-slate-500">Nenhuma live ativa no momento.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {liveStreams.map((s) => {
            const usernameTag = `${s.user.nickname}#${s.user.userTag}`;
            return (
              <Link
                key={usernameTag}
                href={`/stream/${encodeURIComponent(usernameTag)}`}
                className="rounded-lg border border-slate-800 bg-surface p-4 transition hover:border-primary"
              >
                <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-black/40 text-xs text-slate-500">
                  <span className="rounded bg-danger px-2 py-0.5 text-white">AO VIVO</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.user.image && (
                    <Image
                      src={s.user.image}
                      alt={usernameTag}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{s.title}</p>
                    <p className="text-xs text-slate-400">{usernameTag}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
