import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { config, isProd } from '../config';
import { db } from '../db/client';
import { users, type User } from '../db/schema';
import { logger } from '../lib/logger';

export const SESSION_COOKIE = 'fp_session';
const BCRYPT_ROUNDS = config.NODE_ENV === 'test' ? 4 : 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Hash fictício para equalizar o tempo de resposta quando o usuário não existe.
let dummyHash: string | null = null;
export async function dummyVerify(plain: string): Promise<void> {
  dummyHash ??= await bcrypt.hash('dummy-password-for-timing', BCRYPT_ROUNDS);
  await bcrypt.compare(plain, dummyHash);
}

export interface SessionPayload {
  sub: string;
  ver: number;
}

export function signSession(user: Pick<User, 'id' | 'tokenVersion'>): string {
  return jwt.sign({ sub: user.id, ver: user.tokenVersion } satisfies SessionPayload, config.JWT_SECRET, {
    expiresIn: Math.round(config.JWT_EXPIRES_IN_HOURS * 3600),
    algorithm: 'HS256',
  });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const p = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof p.sub !== 'string' || typeof p.ver !== 'number') return null;
    return { sub: p.sub, ver: p.ver };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: Math.round(config.JWT_EXPIRES_IN_HOURS * 3600 * 1000),
};

export { validateNewPassword } from '../core/authPolicy';

/**
 * Cria o usuário inicial (INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD) se ainda não houver usuários.
 * A senha é armazenada somente como hash bcrypt e a troca é exigida no primeiro acesso.
 */
export async function ensureInitialAdmin(): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) return;
  const password = config.INITIAL_ADMIN_PASSWORD ?? (isProd ? undefined : '0080');
  if (!password) {
    logger.warn('Nenhum usuário cadastrado e INITIAL_ADMIN_PASSWORD não definida — usuário inicial não criado.');
    return;
  }
  await db
    .insert(users)
    .values({
      username: config.INITIAL_ADMIN_USERNAME.toLowerCase(),
      name: 'Administrador',
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    })
    .onConflictDoNothing();
  logger.info({ username: config.INITIAL_ADMIN_USERNAME }, 'Usuário inicial criado (troca de senha obrigatória no primeiro acesso).');
}

export async function findUserById(id: string): Promise<User | undefined> {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return u;
}
