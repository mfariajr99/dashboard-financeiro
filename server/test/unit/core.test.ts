import { beforeEach, describe, expect, it } from 'vitest';
import { annualComparison, installmentPlan, monthDashboard, monthDays, receivableSituation } from '../../src/core/calc';
import { businessDaysBetween, easterSunday, isBusinessDay } from '../../src/core/dates';
import { MemoryRepo } from '../../src/core/memoryRepo';
import { loadData, expenses, goals, opportunities, receivables, sales } from '../../src/core/services';
import { seedDemo } from '../../src/core/seed';
import { splitCents } from '../../src/core/money';

const TODAY = '2026-09-15';
const ctx = { today: TODAY, userId: null };

describe('parcelas e taxa', () => {
  it('divide sem perder centavos (resto na última)', () => {
    expect(splitCents(10000, 3)).toEqual([3333, 3333, 3334]);
  });
  it('Boleto em 3x mensal, sem desconto', () => {
    const p = installmentPlan({ gross: 3_000_000, method: 'BOLETO', cardRate: 0.19, count: 3, firstDate: '2026-01-31' });
    expect(p.map((x) => x.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(p.every((x) => x.fee === 0 && x.net === 1_000_000)).toBe(true);
  });
  it('Cartão: 19% sobre o total; datas editadas prevalecem', () => {
    const p = installmentPlan({ gross: 1_000_000, method: 'CARTAO', cardRate: 0.19, count: 2, firstDate: '2026-10-10', dates: [null, '2026-11-20'] });
    expect(p.reduce((a, x) => a + x.fee, 0)).toBe(190_000);
    expect(p.reduce((a, x) => a + x.net, 0)).toBe(810_000);
    expect(p[1].dueDate).toBe('2026-11-20');
  });
});

describe('dias úteis', () => {
  it('Páscoa e feriados nacionais', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(isBusinessDay('2026-04-03')).toBe(false); // Sexta-feira Santa
    expect(isBusinessDay('2026-09-07')).toBe(false); // Independência
    expect(isBusinessDay('2026-11-20')).toBe(false); // Consciência Negra
    expect(isBusinessDay('2026-09-08')).toBe(true);
  });
  it('dias úteis restantes no mês', () => {
    // set/2026: 22 dias úteis (7/9 é feriado); de 15/09 a 30/09 = 12
    expect(businessDaysBetween('2026-09-01', '2026-09-30')).toBe(21);
    expect(monthDays('2026-09', TODAY)).toMatchObject({ businessDaysRemaining: 12, phase: 'CURRENT' });
    expect(monthDays('2026-08', TODAY).businessDaysRemaining).toBe(0);
  });
});

describe('fluxo funil → venda → faturamento', () => {
  let repo: MemoryRepo;
  beforeEach(() => {
    repo = new MemoryRepo();
  });

  it('venda efetuada no cartão: bruto na meta, líquido no faturamento na data de disponibilidade', async () => {
    const o = await opportunities.create(repo, ctx, { client: 'Cliente A', grossAmount: '10000', month: '2026-09' });
    const { sale, receivables: recs } = await opportunities.convert(repo, ctx, o.id, { saleDate: '2026-09-15', paymentMethod: 'CARTAO', installments: 1, firstDate: '2026-10-15' });
    expect(sale).toMatchObject({ grossAmount: '10000.00', feeAmount: '1900.00', netAmount: '8100.00', month: '2026-09' });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ netAmount: '8100.00', dueDate: '2026-10-15', status: 'A_RECEBER' });
    expect((await repo.opportunities.get(o.id))?.status).toBe('VENDA_EFETUADA');
    await expect(opportunities.convert(repo, ctx, o.id, { saleDate: '2026-09-15', paymentMethod: 'PIX', installments: 1, firstDate: '2026-09-15' })).rejects.toMatchObject({ code: 'ALREADY_CONVERTED' });

    await goals.upsert(repo, '2026-09', { salesGoal: 50000, billingGoal: 40000 });
    const d = monthDashboard(await loadData(repo), '2026-09', TODAY);
    expect(d.sales.sold).toBe(1_000_000); // bruto conta na meta de setembro
    expect(d.sales.remaining).toBe(4_000_000);
    expect(d.billing.total).toBe(0); // recurso só disponível em outubro
    const out = monthDashboard(await loadData(repo), '2026-10', TODAY);
    expect(out.billing.total).toBe(810_000);
  });

  it('Pix/Boleto em x vezes sem desconto, programado nos próximos meses', async () => {
    const { receivables: recs } = await sales.create(repo, ctx, { client: 'B', grossAmount: 9000, saleDate: '2026-09-10', paymentMethod: 'BOLETO', installments: 3, firstDate: '2026-09-20' });
    expect(recs.map((r) => [r.dueDate, r.netAmount])).toEqual([
      ['2026-09-20', '3000.00'],
      ['2026-10-20', '3000.00'],
      ['2026-11-20', '3000.00'],
    ]);
  });

  it('Próximo mês leva a oportunidade para o funil seguinte; Declinou sai do funil', async () => {
    const o = await opportunities.create(repo, ctx, { client: 'C', grossAmount: 5000, month: '2026-09', expectedDate: '2026-09-28' });
    const moved = await opportunities.setStatus(repo, o.id, { status: 'PROXIMO_MES' });
    expect(moved).toMatchObject({ month: '2026-10', status: 'ABERTA', postponedCount: 1, expectedDate: '2026-10-28' });
    const d = await opportunities.create(repo, ctx, { client: 'D', grossAmount: 7000, month: '2026-09' });
    await opportunities.setStatus(repo, d.id, { status: 'DECLINOU' });
    const dash = monthDashboard(await loadData(repo), '2026-09', TODAY);
    expect(dash.sales.funnel).toBe(0);
    expect(dash.sales.declinedCount).toBe(1);
    expect(monthDashboard(await loadData(repo), '2026-10', TODAY).sales.funnel).toBe(500_000);
  });

  it('faturamento do mês: recebido, em aberto e a vencer; resultado = faturamento − despesas', async () => {
    const a = await receivables.create(repo, { client: 'R1', paymentMethod: 'PIX', grossAmount: 1000, dueDate: '2026-09-05' });
    await receivables.create(repo, { client: 'R2', paymentMethod: 'BOLETO', grossAmount: 2000, dueDate: '2026-09-10' });
    await receivables.create(repo, { client: 'R3', paymentMethod: 'PIX', grossAmount: 3000, dueDate: '2026-09-25' });
    await receivables.receive(repo, a.id, {}, TODAY);
    await expenses.create(repo, { name: 'Aluguel', amount: 1500, dueDate: '2026-09-10', repeatMonths: 3 }, TODAY);
    const d = monthDashboard(await loadData(repo), '2026-09', TODAY);
    expect(d.billing).toMatchObject({ total: 600_000, received: 100_000, open: 200_000, upcoming: 300_000 });
    expect(d.expenses).toMatchObject({ total: 150_000, open: 150_000 });
    expect(d.result).toMatchObject({ revenue: 600_000, costs: 150_000, profit: 450_000, margin: 0.75 });
    expect((await repo.expenses.all()).map((e) => e.dueDate)).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
    expect(receivableSituation({ status: 'A_RECEBER', dueDate: '2026-09-15' }, TODAY)).toBe('A_VENCER');
  });

  it('prejuízo quando despesas superam o faturamento', async () => {
    await receivables.create(repo, { client: 'R', paymentMethod: 'PIX', grossAmount: 1000, dueDate: '2026-09-20' });
    await expenses.create(repo, { name: 'Folha', amount: 4000, dueDate: '2026-09-05' }, TODAY);
    const d = monthDashboard(await loadData(repo), '2026-09', TODAY);
    expect(d.result.profit).toBe(-300_000);
    expect(d.result.margin).toBe(-3);
  });

  it('editar venda refaz a programação; com parcela recebida, bloqueia mudança de valor', async () => {
    const { sale, receivables: recs } = await sales.create(repo, ctx, { client: 'E', grossAmount: 1200, saleDate: '2026-09-01', paymentMethod: 'PIX', installments: 2, firstDate: '2026-09-01' });
    await sales.update(repo, sale.id, { client: 'E', grossAmount: 1500, saleDate: '2026-09-01', paymentMethod: 'PIX', installments: 3, firstDate: '2026-09-01' });
    expect((await repo.receivables.all()).length).toBe(3);
    const r = (await repo.receivables.all())[0];
    await receivables.receive(repo, r.id, {}, TODAY);
    await expect(sales.update(repo, sale.id, { client: 'E', grossAmount: 2000, saleDate: '2026-09-01', paymentMethod: 'PIX', installments: 3, firstDate: '2026-09-01' })).rejects.toMatchObject({ status: 409 });
    void recs;
  });

  it('comparativo anual: meta × venda, crescimento m/m e acumulado', async () => {
    await goals.saveYear(repo, 2026, [
      { month: '2026-01', salesGoal: 1000, billingGoal: 0 },
      { month: '2026-02', salesGoal: 1000, billingGoal: 0 },
    ]);
    await sales.create(repo, ctx, { client: 'J', grossAmount: 800, saleDate: '2026-01-10', paymentMethod: 'PIX', installments: 1, firstDate: '2026-01-10' });
    await sales.create(repo, ctx, { client: 'F', grossAmount: 1200, saleDate: '2026-02-10', paymentMethod: 'PIX', installments: 1, firstDate: '2026-02-10' });
    const a = annualComparison(await loadData(repo), 2026);
    expect(a.months[0]).toMatchObject({ goal: 100_000, sold: 80_000, percent: 0.8, cumulativeSold: 80_000 });
    expect(a.months[1].growth).toBeCloseTo(0.5);
    expect(a.months[1].cumulativeSold).toBe(200_000);
    expect(a.months[11].cumulativeGoal).toBe(200_000);
    expect(a.totalSold).toBe(200_000);
  });

  it('valida campos e bloqueia duplicidade', async () => {
    await expect(opportunities.create(repo, ctx, { client: '', grossAmount: 0, month: 'x' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const body = { name: 'Luz', amount: 100, dueDate: '2026-09-10' };
    await expenses.create(repo, body, TODAY);
    await expect(expenses.create(repo, body, TODAY)).rejects.toMatchObject({ code: 'POSSIBLE_DUPLICATE' });
  });

  it('seed de demonstração gera cenário completo', async () => {
    await seedDemo(repo, '2026-09-30');
    const d = monthDashboard(await loadData(repo), '2026-09', '2026-09-30');
    expect(d.sales.sold).toBe(6_700_000);
    expect(d.sales.funnelCount).toBe(2);
    expect(d.sales.declinedCount).toBe(1);
    expect(d.billing.open).toBeGreaterThan(0);
    expect(d.billing.upcoming).toBeGreaterThan(0);
    expect(d.expenses.open).toBeGreaterThan(0);
    const a = annualComparison(await loadData(repo), 2026);
    expect(a.months.slice(0, 8).every((m) => m.sold > 0)).toBe(true);
  });
});
