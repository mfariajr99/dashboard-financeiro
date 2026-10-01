/**
 * Tabela de rotas da API (/api/...). O servidor Express e o ambiente de teste no navegador
 * usam esta mesma tabela — só o "transporte" muda.
 */
import { monthOf } from './dates';
import type { Repo, RequestContext } from './repo';
import { expenses, goals, opportunities, receivables, sales, settings, views } from './services';

export interface RouteInput {
  repo: Repo;
  ctx: RequestContext;
  params: Record<string, string>;
  query: { get(name: string): string | null };
  body: unknown;
}
export interface RouteResult {
  status?: number;
  body?: unknown;
}
type Handler = (i: RouteInput) => Promise<RouteResult | unknown>;
export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: Handler;
}

const created = (body: unknown): RouteResult => ({ status: 201, body });
const noContent: RouteResult = { status: 204 };
const year = (q: RouteInput['query'], today: string) => Number(q.get('year') ?? today.slice(0, 4));

export const routes: RouteDef[] = [
  // Funil quente
  { method: 'GET', path: '/opportunities', handler: ({ repo, query }) => opportunities.list(repo, { month: query.get('month'), status: query.get('status'), q: query.get('q') }) },
  { method: 'POST', path: '/opportunities', handler: async ({ repo, ctx, body }) => created(await opportunities.create(repo, ctx, body)) },
  { method: 'GET', path: '/opportunities/:id', handler: ({ repo, params }) => opportunities.get(repo, params.id) },
  { method: 'PUT', path: '/opportunities/:id', handler: ({ repo, params, body }) => opportunities.update(repo, params.id, body) },
  { method: 'PATCH', path: '/opportunities/:id/status', handler: ({ repo, params, body }) => opportunities.setStatus(repo, params.id, body) },
  { method: 'POST', path: '/opportunities/:id/convert', handler: async ({ repo, ctx, params, body }) => created(await opportunities.convert(repo, ctx, params.id, body)) },
  { method: 'DELETE', path: '/opportunities/:id', handler: async ({ repo, params }) => (await opportunities.remove(repo, params.id), noContent) },

  // Vendas efetuadas
  { method: 'GET', path: '/sales', handler: ({ repo, ctx, query }) => sales.list(repo, { month: query.get('month'), q: query.get('q') }, ctx.today) },
  { method: 'POST', path: '/sales', handler: async ({ repo, ctx, body }) => created(await sales.create(repo, ctx, body)) },
  { method: 'GET', path: '/sales/:id', handler: ({ repo, ctx, params }) => sales.get(repo, params.id, ctx.today) },
  { method: 'PUT', path: '/sales/:id', handler: ({ repo, params, body }) => sales.update(repo, params.id, body) },
  { method: 'DELETE', path: '/sales/:id', handler: async ({ repo, params }) => (await sales.remove(repo, params.id), noContent) },

  // Receitas programadas (faturamento)
  { method: 'GET', path: '/receivables', handler: ({ repo, ctx, query }) => receivables.list(repo, { month: query.get('month'), situation: query.get('situation'), q: query.get('q') }, ctx.today) },
  { method: 'POST', path: '/receivables', handler: async ({ repo, body }) => created(await receivables.create(repo, body)) },
  { method: 'GET', path: '/receivables/:id', handler: ({ repo, ctx, params }) => receivables.get(repo, params.id, ctx.today) },
  { method: 'PUT', path: '/receivables/:id', handler: ({ repo, params, body }) => receivables.update(repo, params.id, body) },
  { method: 'PATCH', path: '/receivables/:id/receive', handler: ({ repo, ctx, params, body }) => receivables.receive(repo, params.id, body, ctx.today) },
  { method: 'PATCH', path: '/receivables/:id/unreceive', handler: ({ repo, params }) => receivables.unreceive(repo, params.id) },
  { method: 'DELETE', path: '/receivables/:id', handler: async ({ repo, params }) => (await receivables.remove(repo, params.id), noContent) },

  // Despesas
  { method: 'GET', path: '/expenses', handler: ({ repo, ctx, query }) => expenses.list(repo, { month: query.get('month'), situation: query.get('situation'), q: query.get('q') }, ctx.today) },
  { method: 'POST', path: '/expenses', handler: async ({ repo, ctx, body }) => created(await expenses.create(repo, body, ctx.today)) },
  { method: 'GET', path: '/expenses/:id', handler: ({ repo, ctx, params }) => expenses.get(repo, params.id, ctx.today) },
  { method: 'PUT', path: '/expenses/:id', handler: ({ repo, params, body }) => expenses.update(repo, params.id, body) },
  { method: 'PATCH', path: '/expenses/:id/pay', handler: ({ repo, ctx, params, body }) => expenses.pay(repo, params.id, body, ctx.today) },
  { method: 'PATCH', path: '/expenses/:id/unpay', handler: ({ repo, params }) => expenses.unpay(repo, params.id) },
  { method: 'DELETE', path: '/expenses/:id', handler: ({ repo, params, query }) => expenses.remove(repo, params.id, query.get('series') === 'true') },

  // Metas
  { method: 'GET', path: '/goals', handler: ({ repo, ctx, query }) => goals.year(repo, year(query, ctx.today)) },
  { method: 'PUT', path: '/goals/year/:year', handler: ({ repo, params, body }) => goals.saveYear(repo, Number(params.year), body) },
  { method: 'PUT', path: '/goals/:month', handler: ({ repo, params, body }) => goals.upsert(repo, params.month, body) },

  // Configurações
  { method: 'GET', path: '/settings', handler: async ({ repo, ctx }) => ({ ...(await settings.get(repo)), today: ctx.today }) },
  { method: 'PUT', path: '/settings', handler: async ({ repo, ctx, body }) => ({ ...(await settings.update(repo, body)), today: ctx.today }) },

  // Visões
  { method: 'GET', path: '/dashboard', handler: ({ repo, ctx, query }) => views.dashboard(repo, query.get('month') ?? monthOf(ctx.today), ctx.today) },
  { method: 'GET', path: '/annual', handler: ({ repo, ctx, query }) => views.annual(repo, year(query, ctx.today), ctx.today) },
  { method: 'GET', path: '/calendar', handler: ({ repo, ctx, query }) => views.calendar(repo, query.get('from') ?? '', query.get('to') ?? '', ctx.today) },
];

/** Encontra a rota e extrai os parâmetros (`/sales/:id`). */
export function matchRoute(method: string, path: string): { route: RouteDef; params: Record<string, string> } | null {
  const segs = path.split('/').filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    const pat = route.path.split('/').filter(Boolean);
    if (pat.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      if (pat[i].startsWith(':')) params[pat[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (pat[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function isResult(x: unknown): x is RouteResult {
  return !!x && typeof x === 'object' && ('status' in x || 'body' in x) && Object.keys(x as object).every((k) => k === 'status' || k === 'body');
}
