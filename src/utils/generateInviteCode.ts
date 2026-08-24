import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

// 10 caracteres num alfabeto de 33 (sem ambiguos) dao ~50 bits de entropia
// — junto com o limite de tentativas em /api/servers/join, torna
// impraticavel adivinhar um convite por forca bruta.
const CODE_LENGTH = 10;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // sem caracteres ambiguos
const MAX_ATTEMPTS = 25;

// crypto.randomInt (CSPRNG) em vez de Math.random() — um codigo de convite
// e um segredo (quem tiver ele entra no servidor), e Math.random() nao da
// garantia nenhuma de imprevisibilidade.
function randomCode(): string {
  let result = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
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
