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
 * Aplica as migrations SQL versionadas em /drizzle (idempotente), sempre dentro do schema
 * próprio do sistema (DATABASE_SCHEMA). O controle de migrations também fica nesse schema,
 * então outro sistema no mesmo banco não interfere.
 */
export async function runMigrations(): Promise<void> {
  await pool.query(`create schema if not exists ${SCHEMA}`);
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder, migrationsSchema: SCHEMA, migrationsTable: '__migrations' });
  await importV1Users();
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
