import crypto from "node:crypto";

import type { SecurityCodePurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const CODE_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Cria um codigo de 6 digitos pra uma finalidade (login ou troca de
// senha) — devolve o codigo em texto puro so pra ser enviado por email;
// no banco fica so o hash (mesmo raciocinio de senha: nunca em texto
// puro).
export async function createSecurityCode(
  userId: string,
  purpose: SecurityCodePurpose,
  payload?: string,
): Promise<{ ticketId: string; code: string; expiresAt: Date }> {
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
  const record = await prisma.securityCode.create({
    data: { userId, purpose, codeHash: hashCode(code), payload: payload ?? null, expiresAt },
    select: { id: true },
  });
  return { ticketId: record.id, code, expiresAt };
}

export type VerifyResult =
  | { ok: true; userId: string; payload: string | null }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" };

// Confere um codigo digitado contra o ticket. 5 erros seguidos queima o
// ticket (forca reiniciar do passo 1) mesmo que o proximo palpite estivesse
// certo — evita forca bruta num codigo de 6 digitos.
export async function verifySecurityCode(
  ticketId: string,
  code: string,
  purpose: SecurityCodePurpose,
): Promise<VerifyResult> {
  const record = await prisma.securityCode.findUnique({ where: { id: ticketId } });
  if (!record || record.purpose !== purpose || record.consumedAt) {
    return { ok: false, reason: "not_found" };
  }
  if (record.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.securityCode.update({ where: { id: ticketId }, data: { consumedAt: new Date() } });
    return { ok: false, reason: "too_many_attempts" };
  }
  if (hashCode(code) !== record.codeHash) {
    await prisma.securityCode.update({ where: { id: ticketId }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "mismatch" };
  }
  await prisma.securityCode.update({ where: { id: ticketId }, data: { consumedAt: new Date() } });
  return { ok: true, userId: record.userId, payload: record.payload };
}
