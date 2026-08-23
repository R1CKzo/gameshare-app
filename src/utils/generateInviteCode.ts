import { prisma } from "@/lib/prisma";

const CODE_LENGTH = 8;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // sem caracteres ambiguos
const MAX_ATTEMPTS = 25;

function randomCode(): string {
  let result = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return result;
}

export async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomCode();
    const existing = await prisma.server.findUnique({
      where: { inviteCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new Error(`Não foi possível gerar um código de convite único após ${MAX_ATTEMPTS} tentativas.`);
}
