import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../core/errors';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const notFound = (msg = 'Registro não encontrado') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, code = 'CONFLICT') => new HttpError(409, msg, code);

/** Envolve handlers async para encaminhar erros ao middleware central. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  void _next;
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dados inválidos',
      code: 'VALIDATION_ERROR',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code, issues: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === '23505') {
    res.status(409).json({ error: 'Registro duplicado', code: 'DUPLICATE' });
    return;
  }
  if (pgCode === '23503') {
    res.status(409).json({ error: 'Registro relacionado não encontrado ou em uso', code: 'FOREIGN_KEY' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido', code: 'BAD_JSON' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Conteúdo grande demais. Use imagens menores.', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err, path: req.path }, 'Erro não tratado');
  res.status(500).json({ error: 'Erro interno. Tente novamente.', code: 'INTERNAL' });
}
