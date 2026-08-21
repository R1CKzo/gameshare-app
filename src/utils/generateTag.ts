import { prisma } from "@/lib/prisma";

const TAG_LENGTH = 6;
const MAX_ATTEMPTS = 25;

function randomDigits(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

/**
 * Gera uma tag numerica de 6 digitos unica para o par (nickname, userTag)
 * verificando colisao no banco Neon antes de retornar.
 */
export async function generateUniqueTag(nickname: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomDigits(TAG_LENGTH);

    const existing = await prisma.user.findUnique({
      where: {
        nickname_userTag: {
          nickname,
          userTag: candidate,
        },
      },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  throw new Error(
    `Nao foi possivel gerar uma tag unica para "${nickname}" apos ${MAX_ATTEMPTS} tentativas. Escolha outro nickname.`
  );
}

export function formatUserTag(nickname: string, userTag: string): string {
  return `${nickname}#${userTag}`;
}

export function parseUserTag(usernameTag: string): { nickname: string; userTag: string } | null {
  // Next.js ja decodifica params de rota dinamica; usar try/catch cobre
  // tambem chamadas diretas com strings ainda codificadas (ex: "Nick%23123456").
  let decoded = usernameTag;
  try {
    decoded = decodeURIComponent(usernameTag);
  } catch {
    decoded = usernameTag;
  }

  const separatorIndex = decoded.lastIndexOf("#");
  if (separatorIndex === -1) return null;

  const nickname = decoded.slice(0, separatorIndex);
  const userTag = decoded.slice(separatorIndex + 1);

  if (!nickname || !/^\d{6}$/.test(userTag)) return null;

  return { nickname, userTag };
}
