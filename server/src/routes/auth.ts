import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { db } from '../db/client';
import { auditLogs, users } from '../db/schema';
import { asyncHandler, HttpError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import {
  cookieOptions,
  dummyVerify,
  hashPassword,
  SESSION_COOKIE,
  signSession,
  validateNewPassword,
  verifyPassword,
} from '../services/auth';

export const authRouter = Router();

async function audit(e: { userId: string; action: string; entity: string; entityId: string }) {
  await db.insert(auditLogs).values(e).catch(() => undefined);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.', code: 'RATE_LIMITED' },
});

const loginBody = z.object({
  username: z.string().trim().min(1, 'Informe o usuário').max(80),
  password: z.string().min(1, 'Informe a senha').max(200),
});

function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, username: u.username, name: u.name, mustChangePassword: u.mustChangePassword };
}

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = loginBody.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
    if (!user) {
      await dummyVerify(password);
      throw new HttpError(401, 'Usuário ou senha inválidos.', 'INVALID_CREDENTIALS');
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      await audit({ userId: user.id, action: 'LOGIN_FAILED', entity: 'user', entityId: user.id });
      throw new HttpError(401, 'Usuário ou senha inválidos.', 'INVALID_CREDENTIALS');
    }
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await audit({ userId: user.id, action: 'LOGIN', entity: 'user', entityId: user.id });
    res.cookie(SESSION_COOKIE, signSession(user), cookieOptions);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user!) });
  }),
);

const changeBody = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual').max(200),
  newPassword: z.string().min(1).max(200),
});

authRouter.post(
  '/change-password',
  loginLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changeBody.parse(req.body);
    const user = req.user!;
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      throw new HttpError(400, 'Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD');
    const policy = validateNewPassword(newPassword, user.username);
    if (policy) throw new HttpError(400, policy, 'WEAK_PASSWORD');
    if (await verifyPassword(newPassword, user.passwordHash))
      throw new HttpError(400, 'A nova senha deve ser diferente da atual.', 'SAME_PASSWORD');
    const [updated] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, user.id))
      .returning();
    await audit({ userId: user.id, action: 'PASSWORD_CHANGED', entity: 'user', entityId: user.id });
    // Sessões anteriores são invalidadas (tokenVersion) e uma nova é emitida.
    res.cookie(SESSION_COOKIE, signSession(updated), cookieOptions);
    res.json({ user: publicUser(updated) });
  }),
);
