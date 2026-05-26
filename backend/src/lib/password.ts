import bcrypt from "bcryptjs";

// BCRYPT_ROUNDS — стоимость хеширования.
// Prod: 12 (default). Dev/test: 4 (на порядок быстрее регистрация в API-тестах).
// Соответствие хешей между раундами обеспечивается bcrypt: верификация работает
// одинаково независимо от того, каким cost-фактором сгенерирован хеш.
const ROUNDS = (() => {
  const raw = Number.parseInt(process.env.BCRYPT_ROUNDS ?? "", 10);
  if (!Number.isFinite(raw)) return 12;
  return Math.min(15, Math.max(4, raw));
})();

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
