/**
 * Cálculos do Dashboard Financeiro — funções PURAS (mesmo código no servidor e no HTML de teste).
 * Tudo em centavos inteiros; valores de entidades chegam como string decimal.
 */
import { addDays, addMonthsClamped, addMonthsToKey, businessDaysBetween, eachDay, holidayName, isBetween, monthEnd, monthOf, monthStart, type ISODate, type MonthKey } from './dates';
import { computeFee, splitCents, toCents, type Cents, type PaymentMethod } from './money';
import type { Expense, ExpenseSituation, Goal, Opportunity, Receivable, ReceivableSituation, Sale } from './types';

// ------------------------------------------------------------------ situação
export function receivableSituation(r: Pick<Receivable, 'status' | 'dueDate'>, today: ISODate): ReceivableSituation {
  if (r.status === 'RECEBIDO') return 'RECEBIDO';
  return r.dueDate < today ? 'EM_ABERTO' : 'A_VENCER';
}

export function expenseSituation(e: Pick<Expense, 'status' | 'dueDate'>, today: ISODate): ExpenseSituation {
  if (e.status === 'PAGA') return 'PAGA';
  return e.dueDate < today ? 'EM_ABERTO' : 'A_VENCER';
}

// ------------------------------------------------------------------ taxa e parcelas
/** Pix e Boleto: sem desconto. Cartão: desconta a taxa (padrão 19%). */
export function feeRateFor(method: PaymentMethod, cardRate: number): number {
  return method === 'CARTAO' ? cardRate : 0;
}

export interface InstallmentPlanItem {
  number: number;
  dueDate: ISODate;
  gross: Cents;
  fee: Cents;
  net: Cents;
}

/**
 * Programação das parcelas. Datas: a partir da primeira, mês a mês, mantendo o dia
 * (31/01 → 28/02 → 31/03). Se `dates` vier preenchido (datas editadas pelo usuário), elas prevalecem.
 * A taxa do cartão é calculada sobre o total; centavos de arredondamento ficam na última parcela.
 */
export function installmentPlan(p: { gross: Cents; method: PaymentMethod; cardRate: number; count: number; firstDate: ISODate; dates?: (ISODate | null | undefined)[] }): InstallmentPlanItem[] {
  const count = Math.min(60, Math.max(1, Math.floor(p.count || 1)));
  const { feeCents } = computeFee(p.gross, feeRateFor(p.method, p.cardRate));
  const grossParts = splitCents(p.gross, count);
  const feeParts = splitCents(feeCents, count);
  const day = Number(p.firstDate.slice(8, 10));
  return grossParts.map((g, i) => ({
    number: i + 1,
    dueDate: p.dates?.[i] || addMonthsClamped(p.firstDate, i, day),
    gross: g,
    fee: feeParts[i],
    net: g - feeParts[i],
  }));
}

/** Quantos meses entre início e fim (inclusive). 0 se o fim for antes do início. */
export function monthsInclusive(startMonth: MonthKey, endMonth: MonthKey): number {
  const [ys, ms] = startMonth.split('-').map(Number);
  const [ye, me] = endMonth.split('-').map(Number);
  return Math.max(0, (ye - ys) * 12 + (me - ms) + 1);
}

/**
 * Cobrança recorrente (boleto): vencimento no dia `day` de cada mês, do mês de início ao de fim.
 * Em meses mais curtos o dia é ajustado para o último dia do mês (ex.: 31 → 28/02).
 */
export function recurringDates(day: number, startMonth: MonthKey, endMonth: MonthKey): ISODate[] {
  const n = Math.min(60, monthsInclusive(startMonth, endMonth));
  const d = Math.min(31, Math.max(1, Math.floor(day || 1)));
  return Array.from({ length: n }, (_, i) => addMonthsClamped(`${startMonth}-01`, i, d));
}

/** Reconstrói os dados de uma cobrança recorrente a partir das parcelas já gravadas (para edição). */
export function recurrenceFromDates(dates: ISODate[]): { day: number; startMonth: MonthKey; endMonth: MonthKey } | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { day: Math.max(...sorted.map((d) => Number(d.slice(8, 10)))), startMonth: monthOf(sorted[0]), endMonth: monthOf(sorted[sorted.length - 1]) };
}

// ------------------------------------------------------------------ dias úteis
export interface MonthDays {
  businessDaysTotal: number;
  businessDaysRemaining: number; // de hoje (inclusive) até o fim do mês
  calendarDaysRemaining: number;
  phase: 'PAST' | 'CURRENT' | 'FUTURE';
}

export function monthDays(month: MonthKey, today: ISODate): MonthDays {
  const from = monthStart(month);
  const to = monthEnd(month);
  const total = businessDaysBetween(from, to);
  if (today > to) return { businessDaysTotal: total, businessDaysRemaining: 0, calendarDaysRemaining: 0, phase: 'PAST' };
  if (today < from) return { businessDaysTotal: total, businessDaysRemaining: total, calendarDaysRemaining: Number(to.slice(8)), phase: 'FUTURE' };
  return {
    businessDaysTotal: total,
    businessDaysRemaining: businessDaysBetween(today, to),
    calendarDaysRemaining: Number(to.slice(8)) - Number(today.slice(8)) + 1,
    phase: 'CURRENT',
  };
}

// ------------------------------------------------------------------ dashboard do mês
export interface Data {
  opportunities: Opportunity[];
  sales: Sale[];
  receivables: Receivable[];
  expenses: Expense[];
  goals: Goal[];
}

const sum = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface MonthDashboard {
  month: MonthKey;
  today: ISODate;
  days: MonthDays;
  /** 1) Faturamento do mês (receitas programadas, valor líquido). */
  billing: { total: Cents; received: Cents; open: Cents; upcoming: Cents; count: number; openCount: number };
  /** Despesas do mês. */
  expenses: { total: Cents; paid: Cents; open: Cents; upcoming: Cents; count: number; openCount: number };
  /** 2) Funil quente × Venda efetuada × Meta. */
  sales: {
    goal: Cents;
    sold: Cents; // bruto das vendas efetuadas no mês
    soldCount: number;
    funnel: Cents; // funil quente em aberto do mês
    funnelCount: number;
    remaining: Cents; // falta para a meta
    percent: number | null; // vendido / meta
    projectedPercent: number | null; // (vendido + funil) / meta
    funnelCoverage: number | null; // funil / falta
    perBusinessDay: Cents; // falta / dias úteis restantes
    declinedCount: number;
    postponedCount: number;
  };
  /** Meta de faturamento × programado no mês. */
  billingGoal: { goal: Cents; scheduled: Cents; received: Cents; remaining: Cents; percent: number | null };
  /** 3) Faturamento previsto − Despesas. */
  result: { revenue: Cents; costs: Cents; profit: Cents; margin: number | null };
}

export function monthDashboard(data: Data, month: MonthKey, today: ISODate): MonthDashboard {
  const from = monthStart(month);
  const to = monthEnd(month);
  const inMonth = (d: ISODate | null) => isBetween(d, from, to);
  const goal = data.goals.find((g) => g.month === month);

  const rec = data.receivables.filter((r) => inMonth(r.dueDate));
  const recBy = (s: ReceivableSituation) => rec.filter((r) => receivableSituation(r, today) === s);
  const billing = {
    total: sum(rec.map((r) => toCents(r.netAmount))),
    received: sum(recBy('RECEBIDO').map((r) => toCents(r.netAmount))),
    open: sum(recBy('EM_ABERTO').map((r) => toCents(r.netAmount))),
    upcoming: sum(recBy('A_VENCER').map((r) => toCents(r.netAmount))),
    count: rec.length,
    openCount: recBy('EM_ABERTO').length,
  };

  const exp = data.expenses.filter((e) => inMonth(e.dueDate));
  const expBy = (s: ExpenseSituation) => exp.filter((e) => expenseSituation(e, today) === s);
  const expenses = {
    total: sum(exp.map((e) => toCents(e.amount))),
    paid: sum(expBy('PAGA').map((e) => toCents(e.amount))),
    open: sum(expBy('EM_ABERTO').map((e) => toCents(e.amount))),
    upcoming: sum(expBy('A_VENCER').map((e) => toCents(e.amount))),
    count: exp.length,
    openCount: expBy('EM_ABERTO').length,
  };

  const days = monthDays(month, today);
  const sold = data.sales.filter((s) => s.month === month);
  const soldTotal = sum(sold.map((s) => toCents(s.grossAmount)));
  const opps = data.opportunities.filter((o) => o.month === month);
  const open = opps.filter((o) => o.status === 'ABERTA');
  const funnel = sum(open.map((o) => toCents(o.grossAmount)));
  const salesGoal = goal ? toCents(goal.salesGoal) : 0;
  const remaining = Math.max(0, salesGoal - soldTotal);

  const billingGoal = goal ? toCents(goal.billingGoal) : 0;

  const revenue = billing.total;
  const costs = expenses.total;
  return {
    month,
    today,
    days,
    billing,
    expenses,
    sales: {
      goal: salesGoal,
      sold: soldTotal,
      soldCount: sold.length,
      funnel,
      funnelCount: open.length,
      remaining,
      percent: ratio(soldTotal, salesGoal),
      projectedPercent: ratio(soldTotal + funnel, salesGoal),
      funnelCoverage: remaining > 0 ? funnel / remaining : null,
      perBusinessDay: days.businessDaysRemaining > 0 ? Math.ceil(remaining / days.businessDaysRemaining) : remaining,
      declinedCount: opps.filter((o) => o.status === 'DECLINOU').length,
      postponedCount: open.filter((o) => o.postponedCount > 0).length,
    },
    billingGoal: {
      goal: billingGoal,
      scheduled: billing.total,
      received: billing.received,
      remaining: Math.max(0, billingGoal - billing.total),
      percent: ratio(billing.total, billingGoal),
    },
    result: { revenue, costs, profit: revenue - costs, margin: ratio(revenue - costs, revenue) },
  };
}

// ------------------------------------------------------------------ comparativo anual
export interface AnnualMonth {
  month: MonthKey;
  goal: Cents;
  sold: Cents;
  percent: number | null; // vendido / meta
  growth: number | null; // crescimento sobre o mês anterior
  cumulativeGoal: Cents;
  cumulativeSold: Cents;
}

export function annualComparison(data: Data, year: number, today?: ISODate): { year: number; months: AnnualMonth[]; totalGoal: Cents; totalSold: Cents; percent: number | null; years: number[] } {
  const months: AnnualMonth[] = [];
  let cg = 0;
  let cs = 0;
  // Vendas de dezembro do ano anterior para o crescimento de janeiro.
  let prev = sum(data.sales.filter((s) => s.month === `${year - 1}-12`).map((s) => toCents(s.grossAmount)));
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const g = data.goals.find((x) => x.month === key);
    const goal = g ? toCents(g.salesGoal) : 0;
    const sold = sum(data.sales.filter((s) => s.month === key).map((s) => toCents(s.grossAmount)));
    cg += goal;
    cs += sold;
    // Meses futuros (ainda sem vendas) não têm crescimento calculado.
    const future = !!today && key > monthOf(today);
    months.push({ month: key, goal, sold, percent: ratio(sold, goal), growth: !future && prev > 0 ? (sold - prev) / prev : null, cumulativeGoal: cg, cumulativeSold: cs });
    prev = sold;
  }
  const yearsSet = new Set<number>([year, ...data.sales.map((s) => Number(s.month.slice(0, 4))), ...data.goals.map((g) => Number(g.month.slice(0, 4)))]);
  return { year, months, totalGoal: cg, totalSold: cs, percent: ratio(cs, cg), years: [...yearsSet].sort() };
}

// ------------------------------------------------------------------ calendário
export type CalendarKind = 'RECEITA' | 'DESPESA' | 'OPORTUNIDADE' | 'VENDA';

export interface CalendarItem {
  kind: CalendarKind;
  id: string;
  label: string;
  amount: Cents;
  situation: ReceivableSituation | ExpenseSituation | 'ABERTA' | 'EFETUADA';
  detail: string | null;
}

export function calendar(data: Data, from: ISODate, to: ISODate, today: ISODate) {
  const map = new Map<ISODate, CalendarItem[]>();
  const push = (d: ISODate | null, item: CalendarItem) => {
    if (!d || d < from || d > to) return;
    map.set(d, [...(map.get(d) ?? []), item]);
  };
  const method = { PIX: 'Pix', BOLETO: 'Boleto', CARTAO: 'Cartão' } as const;
  for (const r of data.receivables)
    push(r.dueDate, {
      kind: 'RECEITA',
      id: r.id,
      label: r.client,
      amount: toCents(r.netAmount),
      situation: receivableSituation(r, today),
      detail: `${method[r.paymentMethod]}${r.installmentCount > 1 ? ` · parcela ${r.installmentNumber}/${r.installmentCount}` : ''}`,
    });
  for (const e of data.expenses) push(e.dueDate, { kind: 'DESPESA', id: e.id, label: e.name, amount: toCents(e.amount), situation: expenseSituation(e, today), detail: e.category });
  for (const s of data.sales) push(s.saleDate, { kind: 'VENDA', id: s.id, label: s.client, amount: toCents(s.grossAmount), situation: 'EFETUADA', detail: `${method[s.paymentMethod]} · ${s.installments}x` });
  for (const o of data.opportunities)
    if (o.status === 'ABERTA') push(o.expectedDate, { kind: 'OPORTUNIDADE', id: o.id, label: o.client, amount: toCents(o.grossAmount), situation: 'ABERTA', detail: 'Funil quente' });

  return {
    from,
    to,
    today,
    days: eachDay(from, to).map((d) => {
      const items = map.get(d) ?? [];
      return {
        date: d,
        isToday: d === today,
        holiday: holidayName(d),
        inflow: sum(items.filter((i) => i.kind === 'RECEITA').map((i) => i.amount)),
        outflow: sum(items.filter((i) => i.kind === 'DESPESA').map((i) => i.amount)),
        items,
      };
    }),
  };
}

export { addDays, addMonthsToKey, monthOf };
