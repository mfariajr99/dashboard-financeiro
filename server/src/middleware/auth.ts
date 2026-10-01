import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import type { User } from '../db/schema';
import { HttpError } from '../lib/errors';
import { findUserById, SESSION_COOKIE, verifySession } from '../services/auth';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

/** Exige sessão válida (JWT em cookie HttpOnly; versão do token confere com a do usuário). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const payload = token ? verifySession(token) : null;
    if (!payload) throw new HttpError(401, 'Sessão expirada. Faça login novamente.', 'UNAUTHENTICATED');
    const user = await findUserById(payload.sub);
    if (!user || user.tokenVersion !== payload.ver)
      throw new HttpError(401, 'Sessão expirada. Faça login novamente.', 'UNAUTHENTICATED');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Bloqueia o uso do sistema até que a senha inicial seja trocada. */
export function requirePasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.mustChangePassword) {
    next(new HttpError(403, 'Troque a senha inicial para continuar.', 'PASSWORD_CHANGE_REQUIRED'));
    return;
  }
  next();
}

/**
 * Defesa contra CSRF (além do SameSite=Lax): em requisições que alteram dados,
 * o cabeçalho Origin (quando presente) deve ser da própria aplicação ou de uma origem permitida.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = new Set((config.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const host = req.get('x-forwarded-host') ?? req.get('host');
  try {
    const o = new URL(origin);
    if (o.host === host || allowed.has(origin)) return next();
  } catch {
    /* origem inválida */
  }
  next(new HttpError(403, 'Origem não permitida', 'FORBIDDEN_ORIGIN'));
}
