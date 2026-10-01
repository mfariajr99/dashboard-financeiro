/**
 * Backend do AMBIENTE DE TESTE — roda no navegador e responde às mesmas rotas /api da produção.
 * Usa a MESMA tabela de rotas e as MESMAS regras de negócio do servidor (server/src/core);
 * só a persistência muda: memória + localStorage deste navegador.
 */
import { validateNewPassword } from '../../../server/src/core/authPolicy';
import { todayInTimeZone } from '../../../server/src/core/dates';
import { AppError } from '../../../server/src/core/errors';
import { emptyState, MemoryRepo, type MemoryState } from '../../../server/src/core/memoryRepo';
import { isResult, matchRoute } from '../../../server/src/core/routes';
import { seedDemo } from '../../../server/src/core/seed';

export interface DemoUser {
  username: string;
  name: string;
  password: string; // só no teste local; em produção o servidor guarda hash bcrypt
  mustChangePassword: boolean;
}
interface Persisted {
  version: 2;
  data: MemoryState;
  user: DemoUser;
  loggedIn: boolean;
}

const KEY = 'dashboard-financeiro.teste.v2';
const defaultUser = (): DemoUser => ({ username: 'mlf', name: 'Administrador', password: '0080', mustChangePassword: true });

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Persisted) : null;
    return p?.version === 2 ? p : null;
  } catch {
    return null;
  }
}

const persisted: Persisted = load() ?? { version: 2, data: emptyState(), user: defaultUser(), loggedIn: false };
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    /* armazenamento indisponível: continua em memória */
  }
};
let repo = new MemoryRepo(persisted.data, save);

export const today = () => todayInTimeZone(persisted.data.settings.timezone || 'America/Sao_Paulo');

/** Na primeira abertura, cria os dados de demonstração. */
export const ready: Promise<void> = (async () => {
  if (!load()) {
    await seedDemo(repo, today());
    save();
  }
})();

export async function resetData(kind: 'demo' | 'empty') {
  persisted.data = emptyState();
  repo = new MemoryRepo(persisted.data, save);
  if (kind === 'demo') await seedDemo(repo, today());
  save();
}
export function resetPassword() {
  persisted.user = defaultUser();
  persisted.loggedIn = false;
  save();
}

export interface MockResponse {
  status: number;
  body?: unknown;
}

const publicUser = (u: DemoUser) => ({ id: 'demo-user', username: u.username, name: u.name, mustChangePassword: u.mustChangePassword });
const fail = (status: number, error: string, code: string): MockResponse => ({ status, body: { error, code } });

function auth(method: string, action: string, b: Record<string, unknown>): MockResponse {
  const u = persisted.user;
  if (method === 'POST' && action === 'login') {
    if (String(b.username ?? '').trim().toLowerCase() !== u.username || b.password !== u.password) return fail(401, 'Usuário ou senha inválidos.', 'INVALID_CREDENTIALS');
    persisted.loggedIn = true;
    save();
    return { status: 200, body: { user: publicUser(u) } };
  }
  if (method === 'POST' && action === 'logout') {
    persisted.loggedIn = false;
    save();
    return { status: 204 };
  }
  if (!persisted.loggedIn) return fail(401, 'Sessão expirada. Faça login novamente.', 'UNAUTHENTICATED');
  if (method === 'GET' && action === 'me') return { status: 200, body: { user: publicUser(u) } };
  if (method === 'POST' && action === 'change-password') {
    if (b.currentPassword !== u.password) return fail(400, 'Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD');
    const policy = validateNewPassword(String(b.newPassword ?? ''), u.username);
    if (policy) return fail(400, policy, 'WEAK_PASSWORD');
    if (b.newPassword === u.password) return fail(400, 'A nova senha deve ser diferente da atual.', 'SAME_PASSWORD');
    u.password = String(b.newPassword);
    u.mustChangePassword = false;
    save();
    return { status: 200, body: { user: publicUser(u) } };
  }
  return fail(404, 'Rota não encontrada', 'NOT_FOUND');
}

export async function handle(method: string, url: string, body: unknown): Promise<MockResponse> {
  await ready;
  const u = new URL(url, 'http://teste.local');
  const path = u.pathname.replace(/^\/api/, '') || '/';
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  try {
    if (path === '/health') return { status: 200, body: { status: 'ok', db: 'navegador' } };
    if (path.startsWith('/auth/')) return auth(method, path.slice(6), b);
    if (!persisted.loggedIn) return fail(401, 'Sessão expirada. Faça login novamente.', 'UNAUTHENTICATED');
    if (persisted.user.mustChangePassword) return fail(403, 'Troque a senha inicial para continuar.', 'PASSWORD_CHANGE_REQUIRED');
    const found = matchRoute(method, path);
    if (!found) return fail(404, 'Rota não encontrada', 'NOT_FOUND');
    const out = await found.route.handler({ repo, ctx: { today: today(), userId: 'demo-user' }, params: found.params, query: u.searchParams, body });
    const r = isResult(out) ? out : { status: 200, body: out };
    return { status: r.status ?? 200, body: r.body };
  } catch (err) {
    if (err instanceof AppError) return { status: err.status, body: { error: err.message, code: err.code, issues: err.issues } };
    console.error('[teste] erro inesperado', err);
    return fail(500, 'Erro interno no ambiente de teste.', 'INTERNAL');
  }
}
