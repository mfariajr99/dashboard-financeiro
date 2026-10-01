import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';
import { importLegacyFunil } from '../../src/db/migrate';
import { app, authedAgent, resetDatabase } from './helpers';

type Agent = Awaited<ReturnType<typeof authedAgent>>;
const LEGACY = 'legacy_funil_test';

beforeAll(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await pool.query(`drop schema if exists ${LEGACY} cascade`);
  await pool.end();
});

describe('Funil de Vendas — login único', () => {
  it('API e página exigem login (sem sessão: 401 / volta ao login)', async () => {
    await request(app).get('/api/funil/bootstrap').expect(401);
    await request(app).post('/api/funil/calls').send({ id: 'x' }).expect(401);
    const page = await request(app).get('/funil-app/').expect(302);
    expect(page.headers.location).toBe('/');
    await request(app).get('/funil-app/app.js').expect(401);
  });

  it('senha inicial pendente também bloqueia', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'mlf', password: '0080' }).expect(200);
    expect((await agent.get('/api/funil/bootstrap').expect(403)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await agent.get('/funil-app/').expect(302);
  });

  it('logado: página abre, sem senha no código e sem scripts inline', async () => {
    const agent = await authedAgent();
    const html = (await agent.get('/funil-app/').expect(200)).text;
    expect(html).toContain('<script src="app.js"');
    expect(html).not.toMatch(/<script>/);
    const js = (await agent.get('/funil-app/app.js').expect(200)).text;
    expect(js).not.toMatch(/pass:\s*'0080'|AUTH\s*=\s*\{/);
    expect(js).toContain("'/api/funil/calls'");
  });
});

describe('Funil de Vendas — calls, propostas e diagnósticos', () => {
  let agent: Agent;
  beforeAll(async () => {
    agent = await authedAgent();
  });

  it('cria, mescla, lista e exclui (mesmo contrato do protótipo)', async () => {
    await agent.post('/api/funil/calls').send({ nomeCliente: 'Sem id' }).expect(400);
    const call = { id: 'call_1', nomeCliente: 'Bruno', nomeEmpresa: 'Loja Azul', status: 'agendada', propostasSelecionadas: [] };
    expect((await agent.post('/api/funil/calls').send(call).expect(200)).body).toEqual(call);
    const merged = await agent.put('/api/funil/calls/call_1').send({ status: 'diagnostico_enviado', whatsapp: '11999998888', id: 'outro' }).expect(200);
    expect(merged.body).toMatchObject({ id: 'call_1', nomeCliente: 'Bruno', status: 'diagnostico_enviado', whatsapp: '11999998888' });
    await agent.put('/api/funil/calls/nao-existe').send({ status: 'x' }).expect(404);

    await agent.post('/api/funil/propostas').send({ id: 'p_1', nome: 'Plano Essencial', valor: 15000 }).expect(200);
    await agent.post('/api/funil/diagnosticos').send({ id: 'd_1', callId: 'call_1', faturamentoMensal: 180000 }).expect(200);

    const boot = await agent.get('/api/funil/bootstrap').expect(200);
    expect(boot.body.calls).toHaveLength(1);
    expect(boot.body.propostas[0].nome).toBe('Plano Essencial');
    expect(boot.body.diagnosticos[0].callId).toBe('call_1');
    expect(typeof boot.body.operator.name).toBe('string');

    await agent.delete('/api/funil/propostas/p_1').expect(200);
    expect((await agent.get('/api/funil/propostas').expect(200)).body).toEqual([]);
    await agent.get('/api/funil/outra-coisa').expect(404);
  });

  it('aceita propostas com imagens (até 20 MB), o resto da API segue com limite pequeno', async () => {
    const img = 'data:image/jpeg;base64,' + 'A'.repeat(3 * 1024 * 1024);
    await agent.post('/api/funil/propostas').send({ id: 'p_img', nome: 'Com tela', tela1: img }).expect(200);
    await agent.post('/api/opportunities').send({ client: 'x'.repeat(300 * 1024) }).expect(413);
  });

  it('bloqueia outra origem (CSRF)', async () => {
    await agent.post('/api/funil/calls').set('Origin', 'https://evil.example').send({ id: 'c' }).expect(403);
  });

  it('nome do operador vem do perfil (Configurações → Seu nome)', async () => {
    await agent.patch('/api/auth/profile').send({ name: '' }).expect(400);
    await agent.patch('/api/auth/profile').send({ name: 'Marcos Faria' }).expect(200);
    expect((await agent.get('/api/funil/bootstrap').expect(200)).body.operator.name).toBe('Marcos');
  });
});

describe('Funil de Vendas — importação do protótipo', () => {
  it('copia os dados das tabelas clubn_* uma única vez, sem alterar as originais', async () => {
    await pool.query(`drop schema if exists ${LEGACY} cascade; create schema ${LEGACY}`);
    for (const t of ['clubn_calls', 'clubn_propostas', 'clubn_diagnosticos'])
      await pool.query(`create table ${LEGACY}.${t} (id text primary key, data jsonb not null, updated_at timestamptz default now())`);
    await pool.query(`insert into ${LEGACY}.clubn_calls values ('legacy_c', '{"id":"legacy_c","nomeCliente":"Ana"}', now() - interval '2 days')`);
    await pool.query(`insert into ${LEGACY}.clubn_propostas values ('legacy_p', '{"id":"legacy_p","nome":"Plano Pro"}', now())`);
    await pool.query(`insert into ${LEGACY}.clubn_diagnosticos values ('legacy_d', '{"id":"legacy_d","perfil":"Valor"}', now())`);

    expect(await importLegacyFunil(LEGACY)).toBe(3);
    const agent = await authedAgent();
    const boot = (await agent.get('/api/funil/bootstrap').expect(200)).body;
    expect(boot.calls.map((c: { id: string }) => c.id)).toContain('legacy_c');
    expect(boot.propostas.map((c: { id: string }) => c.id)).toContain('legacy_p');

    // excluído aqui não volta num novo deploy
    await agent.delete('/api/funil/calls/legacy_c').expect(200);
    expect(await importLegacyFunil(LEGACY)).toBe(0);
    expect((await agent.get('/api/funil/calls').expect(200)).body.map((c: { id: string }) => c.id)).not.toContain('legacy_c');
    // tabela original intacta
    expect((await pool.query(`select count(*)::int as n from ${LEGACY}.clubn_calls`)).rows[0].n).toBe(1);
  });
});
