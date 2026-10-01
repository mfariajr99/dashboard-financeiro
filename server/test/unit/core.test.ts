import { beforeEach, describe, expect, it } from 'vitest';
import { annualComparison, installmentPlan, monthDashboard, monthDays, receivableSituation, recurrenceFromDates, recurringDates } from '../../src/core/calc';
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

  it('editar o valor da venda: recebidas ficam, o restante vai para as parcelas em aberto', async () => {
    const body = { client: 'E', grossAmount: 1200, saleDate: '2026-09-01', paymentMethod: 'PIX', installments: 2, firstDate: '2026-09-01' };
    const { sale } = await sales.create(repo, ctx, body);
    await sales.update(repo, sale.id, { ...body, grossAmount: 1500, installments: 3 });
    const parts = async () => (await repo.receivables.all()).filter((x) => x.saleId === sale.id).sort((a, b) => a.installmentNumber - b.installmentNumber);
    expect((await parts()).map((x) => x.grossAmount)).toEqual(['500.00', '500.00', '500.00']);
    await receivables.receive(repo, (await parts())[0].id, {}, TODAY);

    await sales.update(repo, sale.id, { ...body, grossAmount: 2000, installments: 3 });
    const p = await parts();
    expect(p.map((x) => [x.grossAmount, x.status])).toEqual([['500.00', 'RECEBIDO'], ['750.00', 'A_RECEBER'], ['750.00', 'A_RECEBER']]);
    expect((await repo.sales.get(sale.id))?.grossAmount).toBe('2000.00');
    expect(monthDashboard(await loadData(repo), '2026-09', TODAY).sales.sold).toBe(200_000);

    // não pode ficar abaixo do já recebido nem mudar a forma com parcela recebida
    await expect(sales.update(repo, sale.id, { ...body, grossAmount: 400, installments: 3 })).rejects.toMatchObject({ status: 409 });
    await expect(sales.update(repo, sale.id, { ...body, paymentMethod: 'BOLETO', grossAmount: 2000, installments: 3 })).rejects.toMatchObject({ status: 409 });

    // editar o valor de uma parcela ajusta o total da venda
    const upd = (await receivables.update(repo, p[2].id, { dueDate: p[2].dueDate, grossAmount: 900 })) as { saleGrossAmount?: string };
    expect(upd.saleGrossAmount).toBe('2150.00');
    expect((await repo.sales.get(sale.id))?.grossAmount).toBe('2150.00');
  });

  it('cartão: editar valor da parcela recalcula a taxa de 19%', async () => {
    const { sale, receivables: recs } = await sales.create(repo, ctx, { client: 'C', grossAmount: 10000, saleDate: '2026-09-10', paymentMethod: 'CARTAO', installments: 1, firstDate: '2026-10-10' });
    await receivables.update(repo, recs[0].id, { dueDate: '2026-10-10', grossAmount: 12000 });
    expect(await repo.receivables.get(recs[0].id)).toMatchObject({ grossAmount: '12000.00', feeAmount: '2280.00', netAmount: '9720.00' });
    expect(await repo.sales.get(sale.id)).toMatchObject({ grossAmount: '12000.00', feeAmount: '2280.00', netAmount: '9720.00' });
  });

  it('boleto recorrente: dia fixo do mês de início ao fim, já programado no faturamento', async () => {
    const dates = recurringDates(31, '2026-11', '2027-03');
    expect(dates).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
    expect(recurrenceFromDates(dates)).toEqual({ day: 31, startMonth: '2026-11', endMonth: '2027-03' });
    expect(recurringDates(10, '2026-12', '2026-11')).toEqual([]);

    // 5 boletos de R$ 2.000 → venda total R$ 10.000 (entra na meta de setembro)
    const body = { client: 'Contrato', grossAmount: 10000, saleDate: '2026-09-10', paymentMethod: 'BOLETO', installments: 5, firstDate: dates[0], dates };
    const { sale, receivables: recs } = await sales.create(repo, ctx, body);
    expect(recs.map((r) => [r.dueDate, r.netAmount])).toEqual(dates.map((d) => [d, '2000.00']));
    expect(monthDashboard(await loadData(repo), '2026-09', TODAY).sales.sold).toBe(1_000_000);
    expect(monthDashboard(await loadData(repo), '2027-02', TODAY).billing.total).toBe(200_000);

    // só a observação muda → nada é refeito, mesmo com boleto recebido
    await receivables.receive(repo, recs[0].id, {}, TODAY);
    await sales.update(repo, sale.id, { ...body, notes: 'contrato anual' });
    expect((await repo.receivables.get(recs[0].id))?.status).toBe('RECEBIDO');

    // prorrogar até jun/2027: o boleto recebido é mantido e os novos meses entram
    const longer = recurringDates(31, '2026-11', '2027-06');
    await sales.update(repo, sale.id, { ...body, grossAmount: 16000, installments: 8, dates: longer, firstDate: longer[0] });
    const after = (await repo.receivables.all()).filter((r) => r.saleId === sale.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    expect(after).toHaveLength(8);
    expect(after[0]).toMatchObject({ id: recs[0].id, status: 'RECEBIDO', installmentNumber: 1, installmentCount: 8 });
    expect(after.at(-1)).toMatchObject({ dueDate: '2027-06-30', netAmount: '2000.00', status: 'A_RECEBER' });

    // começar depois do boleto já recebido não é permitido (perderia o recebimento)
    const later = recurringDates(31, '2026-12', '2027-06');
    await expect(sales.update(repo, sale.id, { ...body, grossAmount: 14000, installments: 7, dates: later, firstDate: later[0] })).rejects.toMatchObject({ status: 409 });
  });

  it('receita recorrente: uma por mês, editar só esta ou toda a recorrência, excluir as próximas', async () => {
    const base = { client: 'Mensalidade', paymentMethod: 'PIX', grossAmount: 1500, dueDate: '2026-10-05' };
    const created = await receivables.create(repo, { ...base, recurrence: { day: 5, startMonth: '2026-10', endMonth: '2027-03' } });
    expect(created.seriesCount).toBe(6);
    const all = () => repo.receivables.all().then((l) => l.filter((r) => r.client === 'Mensalidade').sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    let list = await all();
    expect(list.map((r) => r.dueDate)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05']);
    expect(new Set(list.map((r) => r.seriesId)).size).toBe(1);
    expect(monthDashboard(await loadData(repo), '2027-01', TODAY).billing.total).toBe(150_000);
    const detail = await receivables.get(repo, list[2].id, TODAY);
    expect(detail.series).toHaveLength(6);

    // cartão desconta 19% em cada mês
    const card = await receivables.create(repo, { ...base, client: 'Cartao rec', paymentMethod: 'CARTAO', grossAmount: 1000, recurrence: { day: 31, startMonth: '2027-01', endMonth: '2027-02' } });
    expect(card.seriesCount).toBe(2);
    const cards = (await repo.receivables.all()).filter((r) => r.client === 'Cartao rec').map((r) => [r.dueDate, r.netAmount]);
    expect(cards).toEqual([['2027-01-31', '810.00'], ['2027-02-28', '810.00']]);

    // só esta: muda a data de uma
    await receivables.update(repo, list[1].id, { ...base, dueDate: '2026-11-10', scope: 'one' });
    expect((await repo.receivables.get(list[1].id))?.dueDate).toBe('2026-11-10');

    // toda a recorrência: recebida mantida, prorroga até jun/27 e muda o dia
    await receivables.receive(repo, list[0].id, {}, TODAY);
    const upd = (await receivables.update(repo, list[3].id, { ...base, scope: 'series', recurrence: { day: 5, startMonth: '2026-10', endMonth: '2027-06' } })) as { seriesCount: number };
    expect(upd.seriesCount).toBe(9);
    list = await all();
    expect(list).toHaveLength(9);
    expect(list[0]).toMatchObject({ id: list[0].id, status: 'RECEBIDO', installmentNumber: 1, installmentCount: 9 });
    expect(list[1].dueDate).toBe('2026-11-05');

    // mudar o valor da recorrência: a recebida fica com o valor antigo, as demais com o novo
    await receivables.update(repo, list[3].id, { ...base, grossAmount: 1800, scope: 'series', recurrence: { day: 5, startMonth: '2026-10', endMonth: '2027-06' } });
    list = await all();
    expect([list[0].grossAmount, list[1].grossAmount, list[8].grossAmount]).toEqual(['1500.00', '1800.00', '1800.00']);

    // não pode sumir com uma receita já recebida
    await expect(receivables.update(repo, list[3].id, { ...base, scope: 'series', recurrence: { day: 5, startMonth: '2026-11', endMonth: '2027-06' } })).rejects.toMatchObject({ status: 409 });
    await expect(receivables.create(repo, { ...base, recurrence: { day: 5, startMonth: '2027-03', endMonth: '2027-01' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // receita única vira recorrente
    const single = await receivables.create(repo, { ...base, client: 'Avulsa' });
    expect(single.seriesCount).toBe(1);
    const conv = (await receivables.update(repo, single.id, { ...base, client: 'Avulsa', scope: 'series', recurrence: { day: 5, startMonth: '2026-10', endMonth: '2026-12' } })) as { seriesCount: number };
    expect(conv.seriesCount).toBe(3);

    // excluir esta e as próximas não recebidas (a recebida fica)
    const r = await receivables.remove(repo, list[4].id, true);
    expect(r.removed).toBe(5);
    expect((await all()).map((x) => x.dueDate)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05']);
  });

  it('despesa recorrente (salário todo dia 12): editar esta e as próximas replica o valor para frente', async () => {
    const base = { name: 'Salário André', category: 'Pessoal', amount: 4500, dueDate: '2026-10-12' };
    const c = (await expenses.create(repo, { ...base, recurrence: { day: 12, startMonth: '2026-10', endMonth: '2027-09' } }, TODAY)) as { seriesCount: number };
    expect(c.seriesCount).toBe(12);
    const all = () => repo.expenses.all().then((l) => l.filter((x) => x.name.startsWith('Salário')).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    let l = await all();
    expect(l.map((x) => x.dueDate.slice(5))).toEqual(['10-12', '11-12', '12-12', '01-12', '02-12', '03-12', '04-12', '05-12', '06-12', '07-12', '08-12', '09-12']);
    expect(monthDashboard(await loadData(repo), '2027-03', TODAY).expenses.total).toBe(450_000);
    await expenses.pay(repo, l[0].id, {}, TODAY);

    // reajuste a partir de janeiro: jan em diante R$ 5.000; out–dez continuam R$ 4.500
    const u = (await expenses.update(repo, l[3].id, { ...base, amount: 5000, scope: 'forward', recurrence: { day: 12, startMonth: '2027-01', endMonth: '2027-09' } })) as { forwardCount: number };
    expect(u.forwardCount).toBe(9);
    l = await all();
    expect(l.map((x) => x.amount)).toEqual(['4500.00', '4500.00', '4500.00', ...Array(9).fill('5000.00')]);

    // prorrogar até dez/2027 a partir de outubro (paga mantida) e mudar o dia para 15 nas em aberto
    await expenses.update(repo, l[0].id, { ...base, amount: 5200, scope: 'forward', recurrence: { day: 15, startMonth: '2026-10', endMonth: '2027-12' } });
    l = await all();
    expect(l).toHaveLength(15);
    expect(l[0]).toMatchObject({ dueDate: '2026-10-12', amount: '4500.00', status: 'PAGA', seriesIndex: 1, seriesCount: 15 });
    expect(l[1]).toMatchObject({ dueDate: '2026-11-15', amount: '5200.00' });
    expect(l[14]).toMatchObject({ dueDate: '2027-12-15', amount: '5200.00', seriesIndex: 15 });

    // encurtar para antes de uma paga não é permitido
    await expenses.pay(repo, l[5].id, {}, TODAY);
    await expect(expenses.update(repo, l[1].id, { ...base, amount: 5200, scope: 'forward', recurrence: { day: 15, startMonth: '2026-11', endMonth: '2027-01' } })).rejects.toMatchObject({ status: 409 });

    // só esta: não mexe nas outras
    await expenses.update(repo, l[2].id, { ...base, amount: 100, dueDate: l[2].dueDate, scope: 'one' });
    expect((await all()).filter((x) => x.amount === '100.00')).toHaveLength(1);
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
