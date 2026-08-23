import { prisma } from "@/lib/prisma";

// Limitador de tentativas simples, sem Redis — uma tabela (AuthThrottle)
// basta na escala desse app. Cada chave (ex: "login_pwd:email@x.com")
// conta tentativas numa janela de tempo; passou do limite, bloqueia por
// um tempo fixo.
export async function checkAndBumpThrottle(
  key: string,
  opts: { maxAttempts: number; windowMs: number; lockoutMs: number },
): Promise<{ allowed: boolean }> {
  const now = new Date();
  const existing = await prisma.authThrottle.findUnique({ where: { key } });

  if (existing?.lockedUntil && existing.lockedUntil > now) {
    return { allowed: false };
  }

  const windowExpired = !existing || now.getTime() - existing.windowStart.getTime() > opts.windowMs;

  if (windowExpired) {
    await prisma.authThrottle.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now, lockedUntil: null },
      update: { count: 1, windowStart: now, lockedUntil: null },
    });
    return { allowed: true };
  }

  const nextCount = existing.count + 1;
  const lockedUntil = nextCount >= opts.maxAttempts ? new Date(now.getTime() + opts.lockoutMs) : null;

  await prisma.authThrottle.update({
    where: { key },
    data: { count: nextCount, lockedUntil },
  });

  return { allowed: nextCount <= opts.maxAttempts };
}
