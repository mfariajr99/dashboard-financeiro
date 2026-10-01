import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config';
import * as schema from './schema';

// NUMERIC chega como string (precisão preservada); DATE como 'YYYY-MM-DD' (sem conversão de fuso).
pg.types.setTypeParser(1082, (v: string) => v);

function sslOption(): pg.PoolConfig['ssl'] {
  if (config.DATABASE_SSL === 'require') return { rejectUnauthorized: false };
  if (config.DATABASE_SSL === 'disable') return false;
  // auto: URLs externas do Render exigem SSL; a URL interna e o localhost não.
  const url = config.DATABASE_URL;
  if (/localhost|127\.0\.0\.1/.test(url) || /sslmode=disable/.test(url)) return false;
  if (/render\.com/.test(url) || /sslmode=require/.test(url)) return { rejectUnauthorized: false };
  return false;
}

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: sslOption(),
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
