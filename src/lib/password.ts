import bcrypt from "bcryptjs";

// bcryptjs (puro JS) em vez do bcrypt nativo — o nativo precisa de um
// binario compilado pra plataforma certa, e algo buildado no Windows nao
// roda na Vercel sem configuracao extra.
const SALT_ROUNDS = 12;

// Hash valido (nao corresponde a senha nenhuma) usado so pra gastar o
// mesmo tempo de bcrypt.compare quando a conta nem tem senha — ver
// verifyPasswordConstantTime abaixo. Gerado uma vez (nao pode ser um
// literal escrito na mao: um hash bcrypt malformado faz o bcrypt.compare
// rejeitar na hora, sem gastar tempo nenhum, o que anularia o proposito).
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash("nunca-vai-bater-com-nada", SALT_ROUNDS);
  return dummyHashPromise;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Mesma verificacao, so que quando a conta NAO tem senha (nulo) ainda
// roda um bcrypt.compare contra um hash generico, gastando o mesmo tempo
// que gastaria se a conta existisse — sem isso, a resposta pra "email sem
// conta com senha" chegava mensuravelmente mais rapido que "senha errada",
// dando pra descobrir por tempo de resposta quais emails tem conta com
// senha, mesmo a mensagem de erro sendo identica nos dois casos.
export async function verifyPasswordConstantTime(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, await getDummyHash());
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8 && password.length <= 72;
}
