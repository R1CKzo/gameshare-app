import bcrypt from "bcryptjs";

// bcryptjs (puro JS) em vez do bcrypt nativo — o nativo precisa de um
// binario compilado pra plataforma certa, e algo buildado no Windows nao
// roda na Vercel sem configuracao extra.
const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8 && password.length <= 72;
}
