import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';
import { app, authedAgent, NEW_PASSWORD, resetDatabase } from './helpers';

type Agent = Awaited<ReturnType<typeof authedAgent>>;

beforeAll(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await pool.end();
});

describe('autenticação e segurança', () => {
  it('health sem login; rotas internas exigem login', async () => {
    expect((await request(app).get('/api/health').expect(200)).body.db).toBe('ok');
    await request(app).get('/api/dashboard').expect(401);
    await request(app).get('/api/opportunities').expect(401);
  });

  it('primeiro acesso mlf/0080 exige troca de senha; cookie HttpOnly', async () => {
    const agent = request.agent(app);
    const r = await agent.post('/api/auth/login').send({ username: 'mlf', password: '0080' }).expect(200);
    expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly/i);
    expect(r.body.user.mustChangePassword).toBe(true);
    expect((await agent.get('/api/dashboard').expect(403)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await agent.post('/api/auth/change-password').send({ currentPassword: '0080', newPassword: 'curta' }).expect(400);
    await agent.post('/api/auth/change-password').send({ currentPassword: '0080', newPassword: NEW_PASSWORD }).expect(200);
    await agent.get('/api/dashboard').expect(200);
    await request(app).post('/api/auth/login').send({ username: 'mlf', password: '0080' }).expect(401);
  });

  it('bloqueia outra origem (CSRF)', async () => {
    const agent = await authedAgent();
    await agent.post('/api/opportunities').set('Origin', 'https://evil.example').send({}).expect(403);
  });
});

describe('funil → venda efetuada → faturamento → dashboard', () => {
  let agent: Agent;
  beforeAll(async () => {
    agent = await authedAgent();
    await agent.put('/api/goals/2026-09').send({ salesGoal: 50000, billingGoal: 30000 }).expect(200);
  });

  it('cadastra, consulta e edita oportunidade; valida dados', async () => {
    const bad = await agent.post('/api/opportunities').send({ client: '', grossAmount: 0, month: '2026-09' }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    const o = await agent.post('/api/opportunities').send({ client: 'Cliente Cartão', grossAmount: '10.000,00'.replace('.', '').replace(',', '.'), month: '2026-09', owner: 'Ana' }).expect(201);
    const got = await agent.get(`/api/opportunities/${o.body.id}`).expect(200);
    expect(got.body.client).toBe('Cliente Cartão');
    const upd = await agent.put(`/api/opportunities/${o.body.id}`).send({ client: 'Cliente Cartão SA', grossAmount: 10000, month: '2026-09' }).expect(200);
    expect(upd.body.client).toBe('Cliente Cartão SA');
  });

  it('venda efetuada no cartão: 19% e data de disponibilidade', async () => {
    const list = await agent.get('/api/opportunities?month=2026-09&status=ABERTA').expect(200);
    const o = list.body[0];
    const r = await agent.post(`/api/opportunities/${o.id}/convert`).send({ saleDate: '2026-09-15', paymentMethod: 'CARTAO', installments: 1, firstDate: '2026-10-15' }).expect(201);
    expect(r.body.sale).toMatchObject({ grossAmount: '10000.00', feeAmount: '1900.00', netAmount: '8100.00', month: '2026-09' });
    expect(r.body.receivables[0]).toMatchObject({ netAmount: '8100.00', dueDate: '2026-10-15' });
    expect((await agent.post(`/api/opportunities/${o.id}/convert`).send({ saleDate: '2026-09-15', paymentMethod: 'PIX', installments: 1, firstDate: '2026-09-15' }).expect(409)).body.code).toBe('ALREADY_CONVERTED');
  });

  it('venda direta em Boleto 3x sem desconto; edição refaz a programação', async () => {
    const s = await agent.post('/api/sales').send({ client: 'Boleto 3x', grossAmount: 9000, saleDate: '2026-09-05', paymentMethod: 'BOLETO', installments: 3, firstDate: '2026-09-10' }).expect(201);
    expect(s.body.receivables.map((x: { dueDate: string; netAmount: string }) => [x.dueDate, x.netAmount])).toEqual([
      ['2026-09-10', '3000.00'],
      ['2026-10-10', '3000.00'],
      ['2026-11-10', '3000.00'],
    ]);
    await agent.put(`/api/sales/${s.body.sale.id}`).send({ client: 'Boleto 3x', grossAmount: 9000, saleDate: '2026-09-05', paymentMethod: 'BOLETO', installments: 2, firstDate: '2026-09-10' }).expect(200);
    const detail = await agent.get(`/api/sales/${s.body.sale.id}`).expect(200);
    expect(detail.body.receivables).toHaveLength(2);
    expect(detail.body.receivables[0].netAmount).toBe('4500.00');
  });

  it('receber parcela, despesas e resultado do mês', async () => {
    const recs = await agent.get('/api/receivables?month=2026-09').expect(200);
    const first = recs.body[0];
    await agent.patch(`/api/receivables/${first.id}/receive`).send({}).expect(200);
    await agent.post('/api/receivables').send({ client: 'Avulsa', paymentMethod: 'PIX', grossAmount: 1000, dueDate: '2026-09-25' }).expect(201);
    await agent.post('/api/expenses').send({ name: 'Aluguel', amount: 2000, dueDate: '2026-09-10', repeatMonths: 3, category: 'Estrutura' }).expect(201);
    const dup = await agent.post('/api/expenses').send({ name: 'Aluguel', amount: 2000, dueDate: '2026-09-10' }).expect(409);
    expect(dup.body.code).toBe('POSSIBLE_DUPLICATE');
    const exps = await agent.get('/api/expenses').expect(200);
    expect(exps.body.map((e: { dueDate: string }) => e.dueDate)).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
    await agent.patch(`/api/expenses/${exps.body[0].id}/pay`).send({}).expect(200);

    const d = await agent.get('/api/dashboard?month=2026-09').expect(200);
    expect(d.body.billing).toMatchObject({ total: 550_000, received: 450_000, upcoming: 100_000, open: 0 });
    expect(d.body.expenses).toMatchObject({ total: 200_000, paid: 200_000 });
    expect(d.body.result).toMatchObject({ revenue: 550_000, costs: 200_000, profit: 350_000 });
    expect(d.body.sales).toMatchObject({ goal: 5_000_000, sold: 1_900_000, remaining: 3_100_000 });
    expect(d.body.days.businessDaysRemaining).toBe(12);
    expect(d.body.annual.months).toHaveLength(12);
    expect(d.body.annual.months[8].sold).toBe(1_900_000);
  });

  it('próximo mês, declinou, metas do ano e calendário', async () => {
    const o = await agent.post('/api/opportunities').send({ client: 'Adiar', grossAmount: 5000, month: '2026-09', expectedDate: '2026-09-28' }).expect(201);
    const moved = await agent.patch(`/api/opportunities/${o.body.id}/status`).send({ status: 'PROXIMO_MES' }).expect(200);
    expect(moved.body).toMatchObject({ month: '2026-10', postponedCount: 1 });
    await agent.patch(`/api/opportunities/${o.body.id}/status`).send({ status: 'DECLINOU' }).expect(200);
    const year = await agent.put('/api/goals/year/2026').send([{ month: '2026-01', salesGoal: 1000, billingGoal: 900 }]).expect(200);
    expect(year.body).toHaveLength(12);
    expect(year.body[0].salesGoal).toBe('1000.00');
    const cal = await agent.get('/api/calendar?from=2026-09-01&to=2026-09-30').expect(200);
    expect(cal.body.days).toHaveLength(30);
    expect(cal.body.days.find((x: { date: string }) => x.date === '2026-09-07').holiday).toBe('Independência do Brasil');
  });

  it('excluir venda devolve a oportunidade ao funil; bloqueia se houver parcela recebida', async () => {
    const sales = await agent.get('/api/sales?month=2026-09').expect(200);
    const card = sales.body.find((s: { client: string }) => s.client === 'Cliente Cartão SA');
    await agent.delete(`/api/sales/${card.id}`).expect(204);
    const opps = await agent.get('/api/opportunities?month=2026-09&status=ABERTA').expect(200);
    expect(opps.body.some((o: { client: string }) => o.client === 'Cliente Cartão SA')).toBe(true);
    const boleto = sales.body.find((s: { client: string }) => s.client === 'Boleto 3x');
    await agent.delete(`/api/sales/${boleto.id}`).expect(409);
  });

  it('configuração da taxa do cartão', async () => {
    const s = await agent.put('/api/settings').send({ cardFeeRate: 10 }).expect(200);
    expect(s.body.cardFeeRate).toBe(0.1);
    const r = await agent.post('/api/receivables').send({ client: 'Cartão 10%', paymentMethod: 'CARTAO', grossAmount: 1000, dueDate: '2026-10-01' }).expect(201);
    expect(r.body.netAmount).toBe('900.00');
    await agent.put('/api/settings').send({ cardFeeRate: 0.19 }).expect(200);
  });

  it('conta pessoal: despesa recorrente, dívida, retirada e visão geral (separada da empresa)', async () => {
    const before = (await agent.get('/api/dashboard?month=2026-10').expect(200)).body.expenses.total;
    const e = await agent.post('/api/personal/expenses').send({ name: 'Pensão', amount: 2000, dueDate: '2026-10-09', recurrence: { day: 9, startMonth: '2026-10', endMonth: '2027-03' } }).expect(201);
    expect(e.body.seriesCount).toBe(6);
    const d = await agent.post('/api/personal/debts').send({ name: 'Empréstimo', creditor: 'Banco', totalAmount: 3000, installments: 3, dueDay: 15, startMonth: '2026-10' }).expect(201);
    await agent.put('/api/personal/months/2026-10').send({ withdrawal: 10000, applyForward: true }).expect(200);
    const inst = await agent.get('/api/personal/debt-installments?month=2026-10').expect(200);
    await agent.patch(`/api/personal/debt-installments/${inst.body[0].id}/pay`).send({}).expect(200);
    const ov = await agent.get('/api/personal/overview?year=2026').expect(200);
    expect(ov.body.months[9]).toMatchObject({ withdrawal: 1_000_000, expensesTotal: 200_000, debtsTotal: 100_000, debtsPaid: 100_000, saving: 700_000 });
    expect(ov.body.months[11].withdrawal).toBe(1_000_000);
    expect((await agent.get(`/api/personal/debts/${d.body.id}`).expect(200)).body).toMatchObject({ paidCount: 1, remainingAmount: '2000.00' });
    // a empresa não muda
    expect((await agent.get('/api/dashboard?month=2026-10').expect(200)).body.expenses.total).toBe(before);
    await agent.delete(`/api/personal/debts/${d.body.id}`).expect(204);
  });

  it('logout encerra a sessão', async () => {
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/dashboard').expect(401);
  });
});
