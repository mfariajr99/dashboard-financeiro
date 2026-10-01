import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

const LEGACY_SCHEMA = 'legacy_v1';
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Atualização a partir da versão 1 (FinPlan). O modelo de dados mudou por completo, então,
 * se o banco ainda tiver as tabelas da v1, elas são MOVIDAS (nada é apagado) para o schema
 * `legacy_v1`, junto com os tipos e o histórico de migrations. Assim as migrations da v2 rodam
 * num schema limpo. Os usuários são copiados de volta depois, preservando a senha já trocada.
 * Retorna true quando houve arquivamento.
 */
async function archiveLegacyV1(): Promise<boolean> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ v1: boolean }>(
      `select to_regclass('public.financial_accounts') is not null or to_regclass('public.monthly_goals') is not null as v1`,
    );
    if (!rows[0]?.v1) return false;
    await client.query('begin');
    await client.query(`create schema if not exists ${LEGACY_SCHEMA}`);
    const tables = await client.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public'`);
    for (const t of tables.rows) await client.query(`alter table public.${q(t.tablename)} set schema ${LEGACY_SCHEMA}`);
    const types = await client.query<{ typname: string }>(
      `select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'`,
    );
    for (const t of types.rows) await client.query(`alter type public.${q(t.typname)} set schema ${LEGACY_SCHEMA}`);
    const hist = await client.query<{ ok: boolean }>(`select to_regclass('drizzle.__drizzle_migrations') is not null as ok`);
    if (hist.rows[0]?.ok) await client.query(`alter table drizzle.__drizzle_migrations set schema ${LEGACY_SCHEMA}`);
    await client.query('commit');
    console.log(`Banco da versão anterior detectado: ${tables.rows.length} tabela(s) movidas para o schema "${LEGACY_SCHEMA}" (backup).`);
    return true;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Traz os usuários da v1 (mesmas colunas) para manter login e senha atuais. */
async function restoreLegacyUsers(): Promise<void> {
  const { rows } = await pool.query<{ ok: boolean }>(`select to_regclass('${LEGACY_SCHEMA}.users') is not null as ok`);
  if (!rows[0]?.ok) return;
  const r = await pool.query(
    `insert into public.users (id, username, name, password_hash, must_change_password, token_version, last_login_at, created_at, updated_at)
     select id, username, name, password_hash, must_change_password, token_version, last_login_at, created_at, updated_at
     from ${LEGACY_SCHEMA}.users
     on conflict do nothing`,
  );
  if (r.rowCount) console.log(`${r.rowCount} usuário(s) da versão anterior mantidos (mesma senha).`);
}

/** Aplica as migrations SQL versionadas em /drizzle (idempotente). */
export async function runMigrations(): Promise<void> {
  const archived = await archiveLegacyV1();
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
  if (archived) await restoreLegacyUsers();
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations aplicadas com sucesso.');
      return pool.end();
    })
    .catch((err: unknown) => {
      console.error('Falha ao aplicar migrations:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
