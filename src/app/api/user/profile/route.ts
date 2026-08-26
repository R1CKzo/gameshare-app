import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NICKNAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;
// Base64 de uma imagem 256x256 cabe bem dentro disso; e uma rede de
// seguranca alem do redimensionamento que ja acontece no navegador.
const MAX_IMAGE_BASE64_LENGTH = 300_000;
// So digitos, espaço e os simbolos comuns de telefone (+, -, parenteses)
// -- nao valida DDD/formato de verdade (o campo e livre, qualquer pais),
// so uma rede de seguranca contra colar algo gigante ou sem sentido ali.
const PHONE_REGEX = /^[\d\s()+-]{0,30}$/;

// Atualiza nickname, foto e/ou telefone do usuario logado. A tag numerica
// (#XXXXXX) nunca muda depois de criada — so o nickname que acompanha ela.
// Telefone e opcional e sem verificacao nenhuma (diferente do email, que
// exige codigo -- ver /api/auth/email); manda "" pra apagar.
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.userTag) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: { nickname?: string; image?: string; phone?: string | null } = {};

  if (typeof body?.nickname === "string") {
    const nickname = body.nickname.trim();
    if (!NICKNAME_REGEX.test(nickname)) {
      return NextResponse.json(
        { error: "Nickname inválido. Use 3-16 caracteres: letras, números ou underline." },
        { status: 400 }
      );
    }

    if (nickname !== session.user.nickname) {
      const existing = await prisma.user.findUnique({
        where: { nickname_userTag: { nickname, userTag: session.user.userTag } },
        select: { id: true },
      });
      if (existing && existing.id !== session.user.id) {
        return NextResponse.json(
          { error: `${nickname}#${session.user.userTag} já está em uso.` },
          { status: 409 }
        );
      }
    }

    data.nickname = nickname;
  }

  if (typeof body?.image === "string") {
    if (body.image.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json({ error: "Imagem muito grande." }, { status: 400 });
    }
    // O cliente sempre redesenha a foto num canvas e exporta como JPEG
    // antes de mandar pra ca — restringir aos formatos raster de verdade
    // (sem svg+xml) fecha a porta pra alguem contornar o cliente e mandar
    // um SVG com script embutido direto pra API.
    if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(body.image)) {
      return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 400 });
    }
    data.image = body.image;
  }

  if (typeof body?.phone === "string") {
    const phone = body.phone.trim();
    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json({ error: "Telefone inválido." }, { status: 400 });
    }
    data.phone = phone || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada pra atualizar." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { nickname: true, userTag: true, image: true, phone: true },
  });

  return NextResponse.json(updated);
}
