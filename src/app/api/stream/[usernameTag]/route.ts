import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { parseUserTag } from "@/utils/generateTag";

export async function GET(
  _request: Request,
  { params }: { params: { usernameTag: string } }
) {
  const parsed = parseUserTag(params.usernameTag);

  if (!parsed) {
    return NextResponse.json({ error: "Identificador invalido." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: {
      nickname_userTag: {
        nickname: parsed.nickname,
        userTag: parsed.userTag,
      },
    },
    select: {
      id: true,
      name: true,
      nickname: true,
      userTag: true,
      image: true,
      stream: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    usernameTag: `${user.nickname}#${user.userTag}`,
    displayName: user.name,
    avatar: user.image,
    stream: user.stream
      ? {
          title: user.stream.title,
          isLive: user.stream.isLive,
          peerId: user.stream.peerId,
        }
      : null,
  });
}
