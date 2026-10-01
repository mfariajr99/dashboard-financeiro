import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config';
import { db, pool } from './client';

const SCHEMA = config.DATABASE_SCHEMA;

/**
 * Se este banco tiver a versão 1 (FinPlan) no schema public, traz os usuários de lá
 * (mantém login e senha já trocada). Nada da v1 — nem de outros sistemas que usem o mesmo
 * banco — é alterado ou apagado.
 */
async function importV1Users(): Promise<void> {
  if (SCHEMA === 'public') return;
  const { rows } = await pool.query<{ v1: boolean }>(
    `select to_regclass('public.financial_accounts') is not null and to_regclass('public.users') is not null as v1`,
  );
  if (!rows[0]?.v1) return;
  const empty = await pool.query<{ n: number }>(`select count(*)::int as n from users`);
  if ((empty.rows[0]?.n ?? 0) > 0) return;
  const r = await pool.query(
    `insert into users (id, username, name, password_hash, must_change_password, token_version, last_login_at, created_at, updated_at)
     select id, username, name, password_hash, must_change_password, token_version, last_login_at, created_at, updated_at
     from public.users on conflict do nothing`,
  );
  if (r.rowCount) console.log(`${r.rowCount} usuário(s) da versão anterior mantidos (mesma senha).`);
}

/**
 * Funil de Vendas: traz UMA VEZ os dados do protótipo "Diagnóstico de Crescimento"
 * (tabelas public.clubn_calls / clubn_propostas / clubn_diagnosticos do mesmo banco).
 * As tabelas antigas não são alteradas nem apagadas. Um marcador evita reimportar
 * (assim, o que for excluído aqui não volta no próximo deploy).
 */
export async function importLegacyFunil(source = 'public'): Promise<number> {
  await pool.query(`create table if not exists funil_import_log (source text primary key, imported_at timestamptz not null default now(), total integer not null)`);
  const done = await pool.query(`select 1 from funil_import_log where source = $1`, [source]);
  if (done.rowCount) return 0;
  let total = 0;
  let found = false;
  for (const [from, to] of [
    ['clubn_calls', 'funil_calls'],
    ['clubn_propostas', 'funil_propostas'],
    ['clubn_diagnosticos', 'funil_diagnosticos'],
  ] as const) {
    const exists = await pool.query<{ ok: boolean }>(`select to_regclass($1) is not null as ok`, [`${source}.${from}`]);
    if (!exists.rows[0]?.ok) continue;
    found = true;
    const r = await pool.query(
      `insert into ${to} (id, data, created_at, updated_at)
       select id, data, coalesce(updated_at, now()), coalesce(updated_at, now()) from "${source}".${from}
       on conflict (id) do nothing`,
    );
    total += r.rowCount ?? 0;
  }
  if (!found) return 0;
  await pool.query(`insert into funil_import_log (source, total) values ($1, $2) on conflict do nothing`, [source, total]);
  if (total) console.log(`Funil de Vendas: ${total} registro(s) do protótipo de diagnóstico importados.`);
  return total;
}

/**
 * Aplica as migrations SQL versionadas em /drizzle (idempotente), sempre dentro do schema
 * próprio do sistema (DATABASE_SCHEMA). O controle de migrations também fica nesse schema,
 * então outro sistema no mesmo banco não interfere.
 */
export async function runMigrations(): Promise<void> {
  await pool.query(`create schema if not exists ${SCHEMA}`);
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder, migrationsSchema: SCHEMA, migrationsTable: '__migrations' });
  await importV1Users();
  if (SCHEMA !== 'public') await importLegacyFunil();
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log(`Migrations aplicadas com sucesso (schema "${SCHEMA}").`);
      return pool.end();
    })
    .catch((err: unknown) => {
      console.error('Falha ao aplicar migrations:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
