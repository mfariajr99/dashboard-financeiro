import { Router, type Request } from 'express';
import { AppError } from '../core/errors';
import { isResult, matchRoute } from '../core/routes';
import { DrizzleRepo } from '../db/drizzleRepo';
import { asyncHandler } from '../lib/errors';
import { today } from '../services/today';

/**
 * Adaptador Express → tabela de rotas do core (as mesmas rotas usadas no ambiente de teste em HTML).
 */
export const apiRouter = Router();

apiRouter.use(
  asyncHandler(async (req: Request, res, next) => {
    const found = matchRoute(req.method, req.path);
    if (!found) return next();
    const repo = new DrizzleRepo(undefined, req.user?.id ?? null);
    const settings = await repo.getSettings();
    const query = { get: (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : null) };
    const out = await found.route.handler({ repo, ctx: { today: today(settings), userId: req.user?.id ?? null }, params: found.params, query, body: req.body });
    const result = isResult(out) ? out : { status: 200, body: out };
    if (result.status === 204) {
      res.status(204).end();
      return;
    }
    res.status(result.status ?? 200).json(result.body ?? null);
  }),
);

export { AppError };
