/**
 * Seed: usuário inicial (hash bcrypt), configurações padrão e — opcionalmente — dados de demonstração.
 *   npm run db:seed                    → base + demo (somente se ainda não houver lançamentos)
 *   node dist/db/seed.js               → apenas base (usado no start de produção)
 *   SEED_DEMO=true node dist/db/seed.js → base + demo em produção (somente se não houver lançamentos)
 *   npm run db:seed -- --reset-demo    → apaga os lançamentos e recria a demo (mantém usuários)
 * A demo é a mesma do ambiente de teste em HTML (src/core/seed.ts).
 */
import { sql } from 'drizzle-orm';
import { seedDemo } from '../core/seed';
import { DEFAULT_SETTINGS } from '../core/types';
import { ensureInitialAdmin } from '../services/auth';
import { today } from '../services/today';
import { db, pool } from './client';
import { DrizzleRepo } from './drizzleRepo';
import { runMigrations } from './migrate';
import { appSettings, auditLogs, expenses, goals, opportunities, receivables, sales } from './schema';

async function main() {
  const args = new Set(process.argv.slice(2));
  await runMigrations();
  await ensureInitialAdmin();
  for (const [key, value] of Object.entries({ ...DEFAULT_SETTINGS, timezone: process.env.APP_TIMEZONE ?? DEFAULT_SETTINGS.timezone }))
    await db.insert(appSettings).values({ key, value }).onConflictDoNothing();

  const wantDemo = args.has('--demo') || args.has('--reset-demo') || process.env.SEED_DEMO === 'true';
  if (!wantDemo || process.env.SEED_DEMO === 'false') {
    console.log('Seed base concluído (sem dados de demonstração).');
    return;
  }
  if (args.has('--reset-demo')) {
    await db.delete(receivables);
    await db.delete(sales);
    await db.delete(opportunities);
    await db.delete(expenses);
    await db.delete(goals);
    await db.delete(auditLogs);
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sales);
  if (count > 0) {
    console.log('Já existem lançamentos — dados de demonstração não foram recriados (use --reset-demo).');
    return;
  }
  const repo = new DrizzleRepo();
  const t = today(await repo.getSettings());
  await seedDemo(repo, t);
  console.log(`Dados de demonstração criados (hoje = ${t}).`);
}

main()
  .then(() => pool.end())
  .catch(async (err: unknown) => {
    console.error('Falha no seed:', err instanceof Error ? err.message : err);
    await pool.end();
    process.exit(1);
  });
