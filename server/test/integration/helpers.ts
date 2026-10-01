import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { ensureInitialAdmin } from '../../src/services/auth';

export const TODAY = '2026-09-15';
process.env.FINPLAN_FAKE_TODAY = TODAY;

export const app = createApp();

export async function resetDatabase() {
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations();
  await ensureInitialAdmin();
}

export const NEW_PASSWORD = 'NovaSenha2026';

/** Faz login com mlf/0080, troca a senha obrigatória e devolve um agente autenticado. */
export async function authedAgent() {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ username: 'mlf', password: '0080' });
  if (login.status === 200) {
    await agent.post('/api/auth/change-password').send({ currentPassword: '0080', newPassword: NEW_PASSWORD }).expect(200);
  } else {
    await agent.post('/api/auth/login').send({ username: 'mlf', password: NEW_PASSWORD }).expect(200);
  }
  return agent;
}
