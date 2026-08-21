import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const liveStreams = await prisma.stream.findMany({
    where: { isLive: true },
    orderBy: { updatedAt: "desc" },
    select: {
      title: true,
      updatedAt: true,
      user: {
        select: { nickname: true, userTag: true, image: true, name: true },
      },
    },
  });

  return NextResponse.json(
    liveStreams.map((s) => ({
      title: s.title,
      updatedAt: s.updatedAt,
      displayName: s.user.name,
      avatar: s.user.image,
      usernameTag: `${s.user.nickname}#${s.user.userTag}`,
    }))
  );
}
