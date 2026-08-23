import { NextResponse } from "next/server";

import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { sendSecurityCodeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ticketId = String(body?.ticketId ?? "");
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket invalido." }, { status: 400 });
  }

  const existing = await prisma.securityCode.findUnique({ where: { id: ticketId } });
  if (!existing || existing.consumedAt) {
    return NextResponse.json({ error: "Ticket invalido ou expirado." }, { status: 400 });
  }

  if (Date.now() - existing.createdAt.getTime() < 30_000) {
    return NextResponse.json({ error: "Aguarde alguns segundos antes de pedir outro codigo." }, { status: 429 });
  }

  const throttle = await checkAndBumpThrottle(`resend:${existing.userId}`, {
    maxAttempts: 3,
    windowMs: 10 * 60 * 1000,
    lockoutMs: 10 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Muitos pedidos de codigo. Tente de novo mais tarde." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId }, select: { email: true } });
  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  // queima o ticket antigo e cria um novo com o mesmo proposito/payload
  await prisma.securityCode.update({ where: { id: ticketId }, data: { consumedAt: new Date() } });
  const { ticketId: newTicketId, code, expiresAt } = await createSecurityCode(
    existing.userId,
    existing.purpose,
    existing.payload ?? undefined,
  );

  try {
    await sendSecurityCodeEmail({ to: user.email, code, purpose: existing.purpose });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel enviar o codigo por email." }, { status: 500 });
  }

  return NextResponse.json({ ticketId: newTicketId, expiresAt });
}
