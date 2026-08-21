import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateUniqueTag } from "@/utils/generateTag";

const NICKNAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const nickname: string | undefined = body?.nickname?.trim();

  if (!nickname || !NICKNAME_REGEX.test(nickname)) {
    return NextResponse.json(
      { error: "Nickname invalido. Use 3-16 caracteres: letras, numeros ou underline." },
      { status: 400 }
    );
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { nickname: true, userTag: true },
  });

  if (currentUser?.nickname && currentUser?.userTag) {
    return NextResponse.json(
      { error: "Este usuario ja possui um nickname definido." },
      { status: 409 }
    );
  }

  try {
    const userTag = await generateUniqueTag(nickname);

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { nickname, userTag },
      select: { nickname: true, userTag: true },
    });

    return NextResponse.json({
      nickname: updatedUser.nickname,
      userTag: updatedUser.userTag,
      usernameTag: `${updatedUser.nickname}#${updatedUser.userTag}`,
    });
  } catch (error) {
    console.error("Erro ao definir nickname:", error);
    return NextResponse.json(
      { error: "Nao foi possivel definir o nickname. Tente novamente." },
      { status: 500 }
    );
  }
}
