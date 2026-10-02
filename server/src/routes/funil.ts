import fs from 'node:fs';
import path from 'node:path';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../db/client';
import { asyncHandler, HttpError } from '../lib/errors';
import { requireAuth, requirePasswordChanged } from '../middleware/auth';

/**
 * Funil de Vendas — API das calls, propostas e diagnósticos (antigo protótipo
 * "Diagnóstico de Crescimento"), agora protegida pelo login único do Dashboard.
 * Os registros são documentos JSON (mesmo formato do protótipo).
 */
const TABLES = { calls: 'funil_calls', propostas: 'funil_propostas', diagnosticos: 'funil_diagnosticos', apresentacoes: 'funil_apresentacoes' } as const;
type Kind = keyof typeof TABLES;
const isKind = (k: string): k is Kind => Object.prototype.hasOwnProperty.call(TABLES, k);

/** Limite por requisição: propostas carregam imagens (prints) já comprimidas no navegador. */
export const FUNIL_BODY_LIMIT = '30mb';

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 120;

async function list(kind: Kind): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(`select data from ${TABLES[kind]} order by updated_at asc, created_at asc`);
  return rows.map((r) => r.data);
}

export const funilApiRouter = Router();
funilApiRouter.use(express.json({ limit: FUNIL_BODY_LIMIT }));

funilApiRouter.get(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const [calls, propostas, diagnosticos, apresentacoes] = await Promise.all([list('calls'), list('propostas'), list('diagnosticos'), list('apresentacoes')]);
    const name = (req.user?.name || req.user?.username || '').trim();
    res.json({ calls, propostas, diagnosticos, apresentacoes, operator: { name: name.split(/\s+/)[0] || name } });
  }),
);

funilApiRouter.param('kind', (_req, _res, next, kind: string) => {
  if (!isKind(kind)) return next(new HttpError(404, 'Rota não encontrada', 'NOT_FOUND'));
  next();
});

funilApiRouter.get(
  '/:kind',
  asyncHandler(async (req, res) => {
    res.json(await list(req.params.kind as Kind));
  }),
);

/** Cria ou substitui o registro inteiro (o id vem do navegador, como no protótipo). */
funilApiRouter.post(
  '/:kind',
  asyncHandler(async (req, res) => {
    const record: unknown = req.body;
    if (!isPlainObject(record) || !validId(record.id)) throw new HttpError(400, 'Registro precisa ter um campo "id".', 'VALIDATION');
    await pool.query(
      `insert into ${TABLES[req.params.kind as Kind]} (id, data) values ($1, $2::jsonb)
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [record.id, JSON.stringify(record)],
    );
    res.json(record);
  }),
);

/** Atualização parcial: mescla os campos enviados com o registro existente (operação atômica). */
funilApiRouter.put(
  '/:kind/:id',
  asyncHandler(async (req, res) => {
    const patch: unknown = req.body;
    if (!isPlainObject(patch)) throw new HttpError(400, 'Envie os campos a alterar.', 'VALIDATION');
    const { id: _ignored, ...rest } = patch;
    void _ignored;
    const { rows } = await pool.query<{ data: unknown }>(
      `update ${TABLES[req.params.kind as Kind]} set data = data || $2::jsonb, updated_at = now() where id = $1 returning data`,
      [req.params.id, JSON.stringify(rest)],
    );
    if (!rows.length) throw new HttpError(404, 'Registro não encontrado.', 'NOT_FOUND');
    res.json(rows[0].data);
  }),
);

funilApiRouter.delete(
  '/:kind/:id',
  asyncHandler(async (req, res) => {
    await pool.query(`delete from ${TABLES[req.params.kind as Kind]} where id = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ página do Funil */

export const FUNIL_APP_DIR = path.resolve(__dirname, '../../funil-app');

/** Página só abre logado. Sem sessão (ou senha inicial pendente), volta para o login do Dashboard. */
function pageAuth(req: Request, res: Response, next: NextFunction): void {
  void requireAuth(req, res, (err?: unknown) => {
    if (err || req.user?.mustChangePassword) {
      if (req.path === '/' || req.path.endsWith('.html')) return res.redirect(302, '/');
      return res.status(401).end();
    }
    next();
  });
}

export function funilPageRouter(): Router {
  const r = Router();
  if (!fs.existsSync(path.join(FUNIL_APP_DIR, 'index.html'))) return r;
  r.use(pageAuth);
  r.use(
    express.static(FUNIL_APP_DIR, {
      index: 'index.html',
      setHeaders: (res, file) => {
        res.setHeader('Cache-Control', /\.(woff2|png|jpe?g|webp)$/.test(file) ? 'private, max-age=86400' : 'no-cache');
      },
    }),
  );
  return r;
}

export { requireAuth, requirePasswordChanged };
