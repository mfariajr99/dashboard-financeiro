/**
 * Regras de negócio do Dashboard Financeiro (v2). Funciona sobre a interface Repo, então roda
 * igual no servidor (PostgreSQL) e no ambiente de teste (navegador).
 */
import { z } from 'zod';
import { annualComparison, calendar, expenseSituation, installmentPlan, mergeReceived, monthDashboard, monthsInclusive, receivableSituation, recurringDates, type Data, type MergedPlanItem } from './calc';
import { addMonthsClamped, addMonthsToKey, diffDays, isISODate, isMonthKey, monthOf } from './dates';
import { AppError, badRequest, conflict, notFound } from './errors';
import { centsToDecimalString, computeFee, toCents } from './money';
import type { Repo, RequestContext } from './repo';
import type { Expense, Opportunity, Receivable, Sale, Settings } from './types';

// ------------------------------------------------------------------ validação
const zMoney = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    try {
      const c = toCents(v);
      if (c <= 0) {
        ctx.addIssue({ code: 'custom', message: 'O valor deve ser maior que zero' });
        return z.NEVER;
      }
      return centsToDecimalString(c);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Valor monetário inválido' });
      return z.NEVER;
    }
  });
const zMoneyZero = z.union([z.number(), z.string()]).transform((v, ctx) => {
  try {
    const c = toCents(v === '' ? 0 : v);
    if (c < 0) {
      ctx.addIssue({ code: 'custom', message: 'Não pode ser negativo' });
      return z.NEVER;
    }
    return centsToDecimalString(c);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Valor inválido' });
    return z.NEVER;
  }
});
const zDate = z.string().refine(isISODate, 'Data inválida');
const zOptDate = z.union([zDate, z.literal(''), z.null()]).optional().transform((v) => v || null);
const zMonth = z.string().refine(isMonthKey, 'Mês inválido');
const zText = (msg: string, max = 160) => z.string({ required_error: msg }).trim().min(1, msg).max(max);
const zOptText = (max = 1000) => z.union([z.string().max(max), z.null()]).optional().transform((v) => (v?.trim() ? v.trim() : null));
const zMethod = z.enum(['PIX', 'BOLETO', 'CARTAO'], { errorMap: () => ({ message: 'Escolha Pix, Boleto ou Cartão' }) });

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, issues[0]?.message ?? 'Dados inválidos', 'VALIDATION_ERROR', issues);
  }
  return r.data;
}

const recent = (iso: string) => Date.now() - new Date(iso).getTime() < 120_000;

// ------------------------------------------------------------------ carregamento
export async function loadData(repo: Repo): Promise<Data> {
  const [opportunities, sales, receivables, expenses, goals] = await Promise.all([repo.opportunities.all(), repo.sales.all(), repo.receivables.all(), repo.expenses.all(), repo.goals.all()]);
  return { opportunities, sales, receivables, expenses, goals };
}

// ================================================================== FUNIL QUENTE
const oppSchema = z.object({
  client: zText('Informe o cliente'),
  description: zOptText(500),
  grossAmount: zMoney,
  month: zMonth,
  expectedDate: zOptDate,
  owner: zOptText(120),
  notes: zOptText(),
  force: z.boolean().optional(),
});

export const opportunities = {
  async list(repo: Repo, q: { month?: string | null; status?: string | null; q?: string | null }) {
    const term = q.q?.toLowerCase().trim();
    return (await repo.opportunities.all())
      .filter((o) => (!q.month || o.month === q.month) && (!q.status || o.status === q.status) && (!term || o.client.toLowerCase().includes(term) || (o.description ?? '').toLowerCase().includes(term)))
      .sort((a, b) => (a.status === b.status ? toCents(b.grossAmount) - toCents(a.grossAmount) : a.status === 'ABERTA' ? -1 : b.status === 'ABERTA' ? 1 : a.status < b.status ? -1 : 1));
  },
  async get(repo: Repo, id: string) {
    const o = await repo.opportunities.get(id);
    if (!o) throw notFound('Oportunidade não encontrada');
    const sale = o.saleId ? await repo.sales.get(o.saleId) : undefined;
    return { ...o, sale: sale ?? null };
  },
  async create(repo: Repo, ctx: RequestContext, input: unknown) {
    const v = parse(oppSchema, input);
    if (!v.force) {
      const all = await repo.opportunities.all();
      if (all.some((o) => o.client === v.client && o.grossAmount === v.grossAmount && o.month === v.month && recent(o.createdAt)))
        throw conflict('Já existe uma oportunidade igual cadastrada agora há pouco. Confirme para salvar mesmo assim.', 'POSSIBLE_DUPLICATE');
    }
    const { force: _f, ...rest } = v;
    void _f;
    const o = await repo.opportunities.insert({ ...rest, status: 'ABERTA', postponedCount: 0, originalMonth: v.month, saleId: null });
    await repo.audit('CREATE', 'opportunity', o.id);
    void ctx;
    return o;
  },
  async update(repo: Repo, id: string, input: unknown) {
    const cur = await repo.opportunities.get(id);
    if (!cur) throw notFound('Oportunidade não encontrada');
    const { force: _f, ...v } = parse(oppSchema, input);
    void _f;
    if (cur.status === 'VENDA_EFETUADA' && v.grossAmount !== cur.grossAmount) throw conflict('Venda já efetuada: altere o valor na venda (Faturamento).');
    const o = await repo.opportunities.update(id, v);
    await repo.audit('UPDATE', 'opportunity', id);
    return o;
  },
  /** Status simples: Em aberto, Declinou ou Próximo mês (move para o funil do mês seguinte). */
  async setStatus(repo: Repo, id: string, input: unknown) {
    const { status } = parse(z.object({ status: z.enum(['ABERTA', 'DECLINOU', 'PROXIMO_MES']) }), input);
    const cur = await repo.opportunities.get(id);
    if (!cur) throw notFound('Oportunidade não encontrada');
    if (cur.status === 'VENDA_EFETUADA') throw conflict('Esta oportunidade já virou venda. Para desfazer, exclua a venda no Faturamento.');
    const patch: Partial<Opportunity> =
      status === 'PROXIMO_MES'
        ? { status: 'ABERTA', month: addMonthsToKey(cur.month, 1), postponedCount: cur.postponedCount + 1, expectedDate: cur.expectedDate ? addMonthsClamped(cur.expectedDate, 1) : null }
        : { status };
    const o = await repo.opportunities.update(id, patch);
    await repo.audit(status, 'opportunity', id);
    return o;
  },
  /** Venda efetuada: cria a venda e a programação de recebimentos, e retira a oportunidade do funil. */
  async convert(repo: Repo, ctx: RequestContext, id: string, input: unknown) {
    return repo.transaction(async (tx) => {
      const o = await tx.opportunities.get(id);
      if (!o) throw notFound('Oportunidade não encontrada');
      if (o.status === 'VENDA_EFETUADA' || o.saleId) throw conflict('Esta oportunidade já virou venda.', 'ALREADY_CONVERTED');
      const body = { client: o.client, description: o.description, grossAmount: o.grossAmount, ...(input as object) };
      const result = await createSale(tx, ctx, body, o.id);
      await tx.opportunities.update(id, { status: 'VENDA_EFETUADA', saleId: result.sale.id });
      await tx.audit('CONVERT', 'opportunity', id);
      return result;
    });
  },
  async remove(repo: Repo, id: string) {
    const o = await repo.opportunities.get(id);
    if (!o) throw notFound('Oportunidade não encontrada');
    await repo.opportunities.remove(id);
    if (o.saleId) await repo.sales.update(o.saleId, { opportunityId: null });
    await repo.audit('DELETE', 'opportunity', id);
  },
};

// ================================================================== VENDAS EFETUADAS
const saleSchema = z.object({
  client: zText('Informe o cliente'),
  description: zOptText(500),
  grossAmount: zMoney,
  saleDate: zDate,
  paymentMethod: zMethod,
  installments: z.coerce.number().int('Parcelas inválidas').min(1, 'Mínimo 1 parcela').max(60, 'Máximo 60 parcelas'),
  /** Primeira data de pagamento (Pix/Boleto) ou de disponibilidade (Cartão). */
  firstDate: zDate,
  /** Datas editadas manualmente, uma por parcela (opcional). */
  dates: z.array(zOptDate).optional(),
  notes: zOptText(),
  force: z.boolean().optional(),
});

async function cardRate(repo: Repo) {
  return (await repo.getSettings()).cardFeeRate;
}

function planFrom(v: z.infer<typeof saleSchema>, rate: number) {
  const plan = installmentPlan({ gross: toCents(v.grossAmount), method: v.paymentMethod, cardRate: rate, count: v.installments, firstDate: v.firstDate, dates: v.dates });
  for (const p of plan) if (diffDays(p.dueDate, v.saleDate) < -31) throw badRequest(`A parcela ${p.number} está muito antes da data da venda.`);
  return plan;
}

async function createSale(repo: Repo, ctx: RequestContext, input: unknown, opportunityId: string | null) {
  const v = parse(saleSchema, input);
  const rate = await cardRate(repo);
  const plan = planFrom(v, rate);
  const feeRate = v.paymentMethod === 'CARTAO' ? rate : 0;
  const { feeCents, netCents } = computeFee(toCents(v.grossAmount), feeRate);
  const sale = await repo.sales.insert({
    opportunityId,
    client: v.client,
    description: v.description,
    grossAmount: v.grossAmount,
    saleDate: v.saleDate,
    month: monthOf(v.saleDate),
    paymentMethod: v.paymentMethod,
    installments: plan.length,
    feeRate: feeRate.toFixed(4),
    feeAmount: centsToDecimalString(feeCents),
    netAmount: centsToDecimalString(netCents),
    notes: v.notes,
  });
  const receivables: Receivable[] = [];
  for (const p of plan)
    receivables.push(
      await repo.receivables.insert({
        saleId: sale.id,
        client: v.client,
        description: v.description,
        paymentMethod: v.paymentMethod,
        installmentNumber: p.number,
        installmentCount: plan.length,
        grossAmount: centsToDecimalString(p.gross),
        feeAmount: centsToDecimalString(p.fee),
        netAmount: centsToDecimalString(p.net),
        dueDate: p.dueDate,
        status: 'A_RECEBER',
        receivedDate: null,
        notes: null,
      }),
    );
  await repo.audit('CREATE', 'sale', sale.id);
  void ctx;
  return { sale, receivables };
}

export const sales = {
  async list(repo: Repo, q: { month?: string | null; q?: string | null }, today: string) {
    const term = q.q?.toLowerCase().trim();
    const recs = await repo.receivables.all();
    return (await repo.sales.all())
      .filter((s) => (!q.month || s.month === q.month) && (!term || s.client.toLowerCase().includes(term) || (s.description ?? '').toLowerCase().includes(term)))
      .sort((a, b) => (a.saleDate < b.saleDate ? 1 : -1))
      .map((s) => {
        const mine = recs.filter((r) => r.saleId === s.id);
        return {
          ...s,
          receivedCount: mine.filter((r) => r.status === 'RECEBIDO').length,
          openCount: mine.filter((r) => receivableSituation(r, today) === 'EM_ABERTO').length,
          nextDueDate: mine.filter((r) => r.status !== 'RECEBIDO').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0]?.dueDate ?? null,
        };
      });
  },
  async get(repo: Repo, id: string, today: string) {
    const s = await repo.sales.get(id);
    if (!s) throw notFound('Venda não encontrada');
    const receivables = (await repo.receivables.all()).filter((r) => r.saleId === id).sort((a, b) => a.installmentNumber - b.installmentNumber);
    return { ...s, receivables: receivables.map((r) => ({ ...r, situation: receivableSituation(r, today) })) };
  },
  async create(repo: Repo, ctx: RequestContext, input: unknown) {
    const v = parse(saleSchema, input);
    if (!v.force) {
      const all = await repo.sales.all();
      if (all.some((s) => s.client === v.client && s.grossAmount === v.grossAmount && s.saleDate === v.saleDate && recent(s.createdAt)))
        throw conflict('Já existe uma venda igual registrada agora há pouco. Confirme para salvar mesmo assim.', 'POSSIBLE_DUPLICATE');
    }
    return repo.transaction((tx) => createSale(tx, ctx, input, null));
  },
  /** Edita a venda (inclusive o valor). Parcelas recebidas são mantidas; as em aberto são refeitas com o restante. */
  async update(repo: Repo, id: string, input: unknown) {
    return repo.transaction(async (tx) => {
      const cur = await tx.sales.get(id);
      if (!cur) throw notFound('Venda não encontrada');
      const v = parse(saleSchema, input);
      const mine = (await tx.receivables.all()).filter((r) => r.saleId === id).sort((x, y) => x.installmentNumber - y.installmentNumber);
      // Cartão mantém a taxa histórica da venda; se a venda passou a ser no cartão, usa a taxa vigente.
      const feeRate = v.paymentMethod === 'CARTAO' ? (cur.paymentMethod === 'CARTAO' ? Number(cur.feeRate) : await cardRate(tx)) : 0;
      const plan = planFrom(v, feeRate);
      const sameDates = plan.length === mine.length && plan.every((p, i) => p.dueDate === mine[i].dueDate);
      const planChanged = v.grossAmount !== cur.grossAmount || v.paymentMethod !== cur.paymentMethod || v.installments !== cur.installments || !sameDates;
      // Parcelas já recebidas ficam como estão; o restante do novo valor vai para as parcelas em aberto.
      const received = mine.filter((r) => r.status === 'RECEBIDO');
      if (planChanged && received.length && v.paymentMethod !== cur.paymentMethod)
        throw conflict('Já há parcelas recebidas: a forma de pagamento não pode mudar. Desfaça os recebimentos primeiro.');
      let items: MergedPlanItem[] = plan;
      if (planChanged && received.length) {
        const merged = mergeReceived({
          plan,
          total: toCents(v.grossAmount),
          rate: feeRate,
          received: received.map((r) => ({ id: r.id, dueDate: r.dueDate, gross: toCents(r.grossAmount), fee: toCents(r.feeAmount) })),
        });
        if ('error' in merged) throw conflict(merged.error);
        items = merged.items;
      }
      const feeCents = planChanged ? items.reduce((a, x) => a + x.fee, 0) : toCents(cur.feeAmount);
      const grossCents = toCents(v.grossAmount);
      const sale = await tx.sales.update(id, {
        client: v.client,
        description: v.description,
        grossAmount: v.grossAmount,
        saleDate: v.saleDate,
        month: monthOf(v.saleDate),
        paymentMethod: v.paymentMethod,
        installments: items.length,
        feeRate: feeRate.toFixed(4),
        feeAmount: centsToDecimalString(feeCents),
        netAmount: centsToDecimalString(grossCents - feeCents),
        notes: v.notes,
      });
      if (planChanged) {
        const kept = new Set(items.map((x) => x.receivedId).filter(Boolean));
        for (const r of mine) if (!kept.has(r.id)) await tx.receivables.remove(r.id);
        for (const p of items) {
          if (p.receivedId) {
            await tx.receivables.update(p.receivedId, { client: v.client, description: v.description, installmentNumber: p.number, installmentCount: items.length });
            continue;
          }
          await tx.receivables.insert({
            saleId: id,
            client: v.client,
            description: v.description,
            paymentMethod: v.paymentMethod,
            installmentNumber: p.number,
            installmentCount: items.length,
            grossAmount: centsToDecimalString(p.gross),
            feeAmount: centsToDecimalString(p.fee),
            netAmount: centsToDecimalString(p.net),
            dueDate: p.dueDate,
            status: 'A_RECEBER',
            receivedDate: null,
            notes: null,
          });
        }
      } else for (const r of mine) await tx.receivables.update(r.id, { client: v.client, description: v.description });
      if (cur.opportunityId) await tx.opportunities.update(cur.opportunityId, { client: v.client, grossAmount: v.grossAmount });
      await tx.audit('UPDATE', 'sale', id);
      return sale;
    });
  },
  /** Exclui a venda e sua programação. A oportunidade de origem volta ao funil como "Em aberto". */
  async remove(repo: Repo, id: string) {
    return repo.transaction(async (tx) => {
      const s = await tx.sales.get(id);
      if (!s) throw notFound('Venda não encontrada');
      const mine = (await tx.receivables.all()).filter((r) => r.saleId === id);
      if (mine.some((r) => r.status === 'RECEBIDO')) throw conflict('Há parcelas já recebidas. Desmarque os recebimentos antes de excluir a venda.');
      for (const r of mine) await tx.receivables.remove(r.id);
      await tx.sales.remove(id);
      if (s.opportunityId) await tx.opportunities.update(s.opportunityId, { status: 'ABERTA', saleId: null });
      await tx.audit('DELETE', 'sale', id);
    });
  },
};

// ================================================================== RECEITAS (FATURAMENTO PROGRAMADO)
const recurrenceSchema = z
  .object({
    day: z.coerce.number({ invalid_type_error: 'Dia do vencimento inválido' }).int().min(1, 'Dia entre 1 e 31').max(31, 'Dia entre 1 e 31'),
    startMonth: zMonth,
    endMonth: zMonth,
  })
  .refine((r) => monthsInclusive(r.startMonth, r.endMonth) >= 1, { message: 'O mês de fim deve ser igual ou depois do mês de início', path: ['endMonth'] })
  .refine((r) => monthsInclusive(r.startMonth, r.endMonth) <= 60, { message: 'A recorrência pode ter no máximo 60 meses', path: ['endMonth'] });

const receivableSchema = z.object({
  client: zText('Informe o cliente / origem da receita'),
  description: zOptText(500),
  paymentMethod: zMethod,
  /** Valor de CADA receita (na recorrente, o valor de cada mês). */
  grossAmount: zMoney,
  dueDate: zDate,
  notes: zOptText(),
  /** Receita recorrente: dia do vencimento, mês de início e mês de fim (uma receita por mês). */
  recurrence: recurrenceSchema.nullable().optional(),
  /** Na edição de uma receita recorrente: "one" = só esta; "series" = toda a recorrência. */
  scope: z.enum(['one', 'series']).optional(),
});

const newSeriesId = () => `R-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Taxa de uma receita avulsa: cartão mantém a taxa histórica se o valor não mudou. */
async function avulsaRate(repo: Repo, method: string, cur?: Receivable | null, gross?: string) {
  if (method !== 'CARTAO') return 0;
  if (cur && cur.paymentMethod === 'CARTAO' && cur.grossAmount === gross) return toCents(cur.feeAmount) / Math.max(1, toCents(cur.grossAmount));
  return cardRate(repo);
}

/**
 * Cria/reprograma uma recorrência de receitas avulsas. Receitas já recebidas são mantidas como estão
 * (precisam continuar no plano, mesma data); as demais são refeitas com o novo valor.
 */
async function programSeries(tx: Repo, v: z.infer<typeof receivableSchema>, existing: Receivable[], seriesId: string, rate: number) {
  const rec = v.recurrence!;
  const dates = recurringDates(rec.day, rec.startMonth, rec.endMonth);
  const { feeCents, netCents } = computeFee(toCents(v.grossAmount), rate);
  const keep = new Map<number, Receivable>();
  for (const r of existing.filter((x) => x.status === 'RECEBIDO')) {
    const idx = dates.findIndex((d, i) => !keep.has(i) && d === r.dueDate);
    if (idx < 0)
      throw conflict(
        `A receita de ${r.dueDate.split('-').reverse().join('/')} já foi recebida e não existe na nova programação. Mantenha-a (mesma data) ou desfaça o recebimento primeiro.`,
      );
    keep.set(idx, r);
  }
  const kept = new Set([...keep.values()].map((r) => r.id));
  for (const r of existing) if (!kept.has(r.id)) await tx.receivables.remove(r.id);
  const out: Receivable[] = [];
  for (const [i, dueDate] of dates.entries()) {
    const common = { client: v.client, description: v.description, installmentNumber: i + 1, installmentCount: dates.length, seriesId };
    const k = keep.get(i);
    if (k) {
      out.push((await tx.receivables.update(k.id, common))!);
      continue;
    }
    out.push(
      await tx.receivables.insert({
        saleId: null,
        ...common,
        paymentMethod: v.paymentMethod,
        grossAmount: v.grossAmount,
        feeAmount: centsToDecimalString(feeCents),
        netAmount: centsToDecimalString(netCents),
        dueDate,
        status: 'A_RECEBER',
        receivedDate: null,
        notes: v.notes,
      }),
    );
  }
  return out;
}

export const receivables = {
  async list(repo: Repo, q: { month?: string | null; situation?: string | null; q?: string | null }, today: string) {
    const term = q.q?.toLowerCase().trim();
    return (await repo.receivables.all())
      .map((r) => ({ ...r, situation: receivableSituation(r, today) }))
      .filter((r) => (!q.month || monthOf(r.dueDate) === q.month) && (!q.situation || r.situation === q.situation) && (!term || r.client.toLowerCase().includes(term) || (r.description ?? '').toLowerCase().includes(term)))
      .sort((a, b) => (a.dueDate === b.dueDate ? a.client.localeCompare(b.client) : a.dueDate < b.dueDate ? -1 : 1));
  },
  async get(repo: Repo, id: string, today: string) {
    const r = await repo.receivables.get(id);
    if (!r) throw notFound('Receita não encontrada');
    const series = r.seriesId
      ? (await repo.receivables.all())
          .filter((x) => x.seriesId === r.seriesId)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .map((x) => ({ id: x.id, dueDate: x.dueDate, status: x.status }))
      : [];
    return { ...r, situation: receivableSituation(r, today), series };
  },
  /** Receita avulsa (sem venda), única ou recorrente. Cartão desconta a taxa configurada. */
  async create(repo: Repo, input: unknown) {
    const v = parse(receivableSchema, input);
    const rate = await avulsaRate(repo, v.paymentMethod);
    if (v.recurrence) {
      const items = await repo.transaction((tx) => programSeries(tx, v, [], newSeriesId(), rate));
      await repo.audit('CREATE', 'receivable', items[0].id);
      return { ...items[0], seriesCount: items.length };
    }
    const { feeCents, netCents } = computeFee(toCents(v.grossAmount), rate);
    const { recurrence: _r, scope: _s, ...data } = v;
    void _r;
    void _s;
    const r = await repo.receivables.insert({ saleId: null, ...data, installmentNumber: 1, installmentCount: 1, feeAmount: centsToDecimalString(feeCents), netAmount: centsToDecimalString(netCents), status: 'A_RECEBER', receivedDate: null, seriesId: null });
    await repo.audit('CREATE', 'receivable', r.id);
    return { ...r, seriesCount: 1 };
  },
  /**
   * Parcela de venda: altera data e observação. Receita avulsa: altera tudo.
   * Com `scope: "series"` e `recurrence`, reprograma toda a recorrência (ou transforma uma receita única em recorrente).
   */
  async update(repo: Repo, id: string, input: unknown) {
    const cur = await repo.receivables.get(id);
    if (!cur) throw notFound('Receita não encontrada');
    if (cur.saleId) {
      // Parcela de venda: data, observação e VALOR. Mudar o valor ajusta o total da venda (soma das parcelas).
      const v = parse(z.object({ dueDate: zDate, notes: zOptText(), grossAmount: zMoney.optional() }), input);
      const saleId = cur.saleId;
      return repo.transaction(async (tx) => {
        if (v.grossAmount === undefined || v.grossAmount === cur.grossAmount) return tx.receivables.update(id, { dueDate: v.dueDate, notes: v.notes });
        const sale = await tx.sales.get(saleId);
        if (!sale) throw notFound('Venda não encontrada');
        const { feeCents, netCents } = computeFee(toCents(v.grossAmount), Number(sale.feeRate));
        const r = await tx.receivables.update(id, {
          dueDate: v.dueDate,
          notes: v.notes,
          grossAmount: v.grossAmount,
          feeAmount: centsToDecimalString(feeCents),
          netAmount: centsToDecimalString(netCents),
        });
        const parts = (await tx.receivables.all()).filter((x) => x.saleId === saleId);
        const g = parts.reduce((a, x) => a + toCents(x.grossAmount), 0);
        const f = parts.reduce((a, x) => a + toCents(x.feeAmount), 0);
        await tx.sales.update(saleId, { grossAmount: centsToDecimalString(g), feeAmount: centsToDecimalString(f), netAmount: centsToDecimalString(g - f) });
        if (sale.opportunityId) await tx.opportunities.update(sale.opportunityId, { grossAmount: centsToDecimalString(g) });
        await tx.audit('UPDATE', 'receivable', id);
        return { ...r, saleGrossAmount: centsToDecimalString(g) };
      });
    }
    const v = parse(receivableSchema, input);
    const rate = await avulsaRate(repo, v.paymentMethod, cur, v.grossAmount);
    if (v.scope === 'series' && v.recurrence) {
      const items = await repo.transaction(async (tx) => {
        const existing = cur.seriesId ? (await tx.receivables.all()).filter((x) => x.seriesId === cur.seriesId) : [cur];
        return programSeries(tx, v, existing, cur.seriesId ?? newSeriesId(), rate);
      });
      await repo.audit('UPDATE', 'receivable', id);
      return { ...items[0], seriesCount: items.length };
    }
    const { feeCents, netCents } = computeFee(toCents(v.grossAmount), rate);
    const { recurrence: _r, scope: _s, ...data } = v;
    void _r;
    void _s;
    const r = await repo.receivables.update(id, { ...data, feeAmount: centsToDecimalString(feeCents), netAmount: centsToDecimalString(netCents) });
    await repo.audit('UPDATE', 'receivable', id);
    return { ...r, seriesCount: 1 };
  },
  async receive(repo: Repo, id: string, input: unknown, today: string) {
    const { receivedDate } = parse(z.object({ receivedDate: zOptDate }), input);
    const r = await repo.receivables.update(id, { status: 'RECEBIDO', receivedDate: receivedDate ?? today });
    if (!r) throw notFound('Receita não encontrada');
    await repo.audit('RECEIVE', 'receivable', id);
    return r;
  },
  async unreceive(repo: Repo, id: string) {
    const r = await repo.receivables.update(id, { status: 'A_RECEBER', receivedDate: null });
    if (!r) throw notFound('Receita não encontrada');
    return r;
  },
  /** Exclui a receita; com `series`, exclui também as próximas da recorrência ainda não recebidas. */
  async remove(repo: Repo, id: string, series = false) {
    const r = await repo.receivables.get(id);
    if (!r) throw notFound('Receita não encontrada');
    if (r.saleId) throw conflict('Esta receita é parcela de uma venda. Edite ou exclua a venda em "Vendas efetuadas".');
    let removed = 0;
    await repo.transaction(async (tx) => {
      await tx.receivables.remove(id);
      removed++;
      if (series && r.seriesId)
        for (const x of await tx.receivables.all())
          if (x.seriesId === r.seriesId && x.id !== id && x.dueDate > r.dueDate && x.status !== 'RECEBIDO') {
            await tx.receivables.remove(x.id);
            removed++;
          }
    });
    await repo.audit('DELETE', 'receivable', id);
    return { removed };
  },
};

// ================================================================== DESPESAS
const expenseSchema = z.object({
  name: zText('Informe a despesa'),
  category: zOptText(80),
  supplier: zOptText(120),
  amount: zMoney,
  dueDate: zDate,
  paid: z.boolean().optional(),
  paidDate: zOptDate,
  /** Repetir mensalmente por N meses (somente no cadastro; mantido por compatibilidade). */
  repeatMonths: z.coerce.number().int().min(1).max(60).optional(),
  /** Despesa recorrente: dia do vencimento, mês de início e mês de fim (uma por mês). */
  recurrence: recurrenceSchema.nullable().optional(),
  /** Edição: "one" = só esta; "forward" = esta e as próximas (valor, dados, dia e mês de fim). */
  scope: z.enum(['one', 'forward']).optional(),
  notes: zOptText(),
  force: z.boolean().optional(),
});

export const expenses = {
  async list(repo: Repo, q: { month?: string | null; situation?: string | null; q?: string | null }, today: string) {
    const term = q.q?.toLowerCase().trim();
    return (await repo.expenses.all())
      .map((e) => ({ ...e, situation: expenseSituation(e, today) }))
      .filter((e) => (!q.month || monthOf(e.dueDate) === q.month) && (!q.situation || e.situation === q.situation) && (!term || [e.name, e.category ?? '', e.supplier ?? ''].some((x) => x.toLowerCase().includes(term))))
      .sort((a, b) => (a.dueDate === b.dueDate ? a.name.localeCompare(b.name) : a.dueDate < b.dueDate ? -1 : 1));
  },
  async get(repo: Repo, id: string, today: string) {
    const e = await repo.expenses.get(id);
    if (!e) throw notFound('Despesa não encontrada');
    const series = e.seriesId
      ? (await repo.expenses.all())
          .filter((x) => x.seriesId === e.seriesId)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .map((x) => ({ id: x.id, dueDate: x.dueDate, status: x.status }))
      : [];
    return { ...e, situation: expenseSituation(e, today), series };
  },
  async create(repo: Repo, input: unknown, today: string) {
    const v = parse(expenseSchema, input);
    if (!v.force) {
      const all = await repo.expenses.all();
      if (all.some((e) => e.name === v.name && e.amount === v.amount && e.dueDate === v.dueDate && recent(e.createdAt)))
        throw conflict('Já existe uma despesa igual cadastrada agora há pouco. Confirme para salvar mesmo assim.', 'POSSIBLE_DUPLICATE');
    }
    const day = Number(v.dueDate.slice(8, 10));
    const dates = v.recurrence
      ? recurringDates(v.recurrence.day, v.recurrence.startMonth, v.recurrence.endMonth)
      : Array.from({ length: v.repeatMonths ?? 1 }, (_, i) => addMonthsClamped(v.dueDate, i, day));
    const n = dates.length;
    const seriesId = n > 1 ? `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` : null;
    return repo.transaction(async (tx) => {
      const rows: Expense[] = [];
      for (let i = 0; i < n; i++) {
        const paid = i === 0 && !!v.paid;
        rows.push(
          await tx.expenses.insert({
            name: v.name,
            category: v.category,
            supplier: v.supplier,
            amount: v.amount,
            dueDate: dates[i],
            status: paid ? 'PAGA' : 'PENDENTE',
            paidDate: paid ? (v.paidDate ?? today) : null,
            seriesId,
            seriesIndex: seriesId ? i + 1 : null,
            seriesCount: seriesId ? n : null,
            notes: v.notes,
          }),
        );
      }
      await tx.audit('CREATE', 'expense', rows[0].id);
      return { ...rows[0], seriesCount: n };
    });
  },
  /**
   * Edita a despesa. Com `scope: "forward"` e `recurrence`, aplica valor/dados a esta e às próximas
   * (do mês desta até o mês de fim), cria os meses que faltarem e remove os que sobrarem.
   * Meses anteriores não mudam; despesas já pagas mantêm valor e data.
   */
  async update(repo: Repo, id: string, input: unknown) {
    const cur = await repo.expenses.get(id);
    if (!cur) throw notFound('Despesa não encontrada');
    const v = parse(expenseSchema, input);
    if (v.scope === 'forward' && v.recurrence) {
      const rec = v.recurrence;
      const start = monthOf(cur.dueDate);
      const dates = recurringDates(rec.day, start, rec.endMonth);
      if (!dates.length) throw badRequest('O mês de fim deve ser igual ou depois do mês desta despesa');
      return repo.transaction(async (tx) => {
        const seriesId = cur.seriesId ?? `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const members = cur.seriesId ? (await tx.expenses.all()).filter((x) => x.seriesId === cur.seriesId) : [cur];
        const tail = members.filter((x) => monthOf(x.dueDate) >= start);
        const used = new Set<string>();
        for (const dueDate of dates) {
          const m = monthOf(dueDate);
          const ex = tail.find((x) => !used.has(x.id) && monthOf(x.dueDate) === m);
          const data = { name: v.name, category: v.category, supplier: v.supplier, notes: v.notes, seriesId };
          if (ex) {
            used.add(ex.id);
            await tx.expenses.update(ex.id, ex.status === 'PAGA' ? data : { ...data, amount: v.amount, dueDate });
          } else
            await tx.expenses.insert({ ...data, amount: v.amount, dueDate, status: 'PENDENTE', paidDate: null, seriesIndex: null, seriesCount: null });
        }
        for (const x of tail)
          if (!used.has(x.id)) {
            if (x.status === 'PAGA') throw conflict(`A despesa de ${x.dueDate.split('-').reverse().join('/')} já foi paga e ficaria fora da recorrência. Ajuste o mês de fim ou desfaça o pagamento.`);
            await tx.expenses.remove(x.id);
          }
        // pagamento desta despesa (checkbox do formulário)
        const paid = v.paid ?? cur.status === 'PAGA';
        await tx.expenses.update(id, { status: paid ? 'PAGA' : 'PENDENTE', paidDate: paid ? (v.paidDate ?? cur.paidDate ?? cur.dueDate) : null });
        // renumera a série inteira
        const all = (await tx.expenses.all()).filter((x) => x.seriesId === seriesId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        for (const [i, x] of all.entries()) await tx.expenses.update(x.id, { seriesIndex: i + 1, seriesCount: all.length });
        await tx.audit('UPDATE', 'expense', id);
        const changed = all.filter((x) => monthOf(x.dueDate) >= start).length;
        return { ...(await tx.expenses.get(id)), seriesCount: all.length, forwardCount: changed };
      });
    }
    const paid = v.paid ?? cur.status === 'PAGA';
    const e = await repo.expenses.update(id, {
      name: v.name,
      category: v.category,
      supplier: v.supplier,
      amount: v.amount,
      dueDate: v.dueDate,
      status: paid ? 'PAGA' : 'PENDENTE',
      paidDate: paid ? (v.paidDate ?? cur.paidDate ?? v.dueDate) : null,
      notes: v.notes,
    });
    await repo.audit('UPDATE', 'expense', id);
    return e;
  },
  async pay(repo: Repo, id: string, input: unknown, today: string) {
    const { paidDate } = parse(z.object({ paidDate: zOptDate }), input);
    const e = await repo.expenses.update(id, { status: 'PAGA', paidDate: paidDate ?? today });
    if (!e) throw notFound('Despesa não encontrada');
    return e;
  },
  async unpay(repo: Repo, id: string) {
    const e = await repo.expenses.update(id, { status: 'PENDENTE', paidDate: null });
    if (!e) throw notFound('Despesa não encontrada');
    return e;
  },
  /** Exclui a despesa; com `series`, exclui também as próximas da mesma série ainda não pagas. */
  async remove(repo: Repo, id: string, series: boolean) {
    const e = await repo.expenses.get(id);
    if (!e) throw notFound('Despesa não encontrada');
    let removed = 0;
    await repo.transaction(async (tx) => {
      await tx.expenses.remove(id);
      removed++;
      if (series && e.seriesId)
        for (const x of await tx.expenses.all())
          if (x.seriesId === e.seriesId && x.dueDate > e.dueDate && x.status !== 'PAGA') {
            await tx.expenses.remove(x.id);
            removed++;
          }
      await tx.audit('DELETE', 'expense', id);
    });
    return { removed };
  },
};

// ================================================================== METAS
export const goals = {
  /** As 12 metas do ano (meses sem meta vêm zerados). */
  async year(repo: Repo, year: number) {
    const all = await repo.goals.all();
    return Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, '0')}`;
      const g = all.find((x) => x.month === month);
      return { month, salesGoal: g?.salesGoal ?? '0.00', billingGoal: g?.billingGoal ?? '0.00', id: g?.id ?? null };
    });
  },
  async upsert(repo: Repo, month: string, input: unknown) {
    if (!isMonthKey(month)) throw badRequest('Mês inválido');
    const v = parse(z.object({ salesGoal: zMoneyZero, billingGoal: zMoneyZero }), input);
    const cur = (await repo.goals.all()).find((g) => g.month === month);
    const g = cur ? await repo.goals.update(cur.id, v) : await repo.goals.insert({ month, ...v });
    await repo.audit('UPSERT', 'goal', month);
    return g;
  },
  async saveYear(repo: Repo, year: number, input: unknown) {
    const rows = parse(z.array(z.object({ month: zMonth, salesGoal: zMoneyZero, billingGoal: zMoneyZero })).max(12), input);
    await repo.transaction(async (tx) => {
      for (const r of rows) {
        if (!r.month.startsWith(`${year}-`)) throw badRequest('Mês fora do ano informado');
        await goals.upsert(tx, r.month, r);
      }
    });
    return goals.year(repo, year);
  },
};

// ================================================================== CONFIGURAÇÕES
export const settings = {
  get: (repo: Repo) => repo.getSettings(),
  async update(repo: Repo, input: unknown) {
    const v = parse(
      z.object({
        cardFeeRate: z.coerce
          .number()
          .min(0)
          .max(100)
          .transform((n) => (n > 1 ? n / 100 : n))
          .optional(),
        companyName: z.string().trim().min(1).max(80).optional(),
      }),
      input,
    );
    const cur = await repo.getSettings();
    const next: Settings = { ...cur, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) };
    return repo.saveSettings(next);
  },
};

// ================================================================== DASHBOARD / CALENDÁRIO
export const views = {
  async dashboard(repo: Repo, month: string, today: string) {
    if (!isMonthKey(month)) throw badRequest('Mês inválido');
    const data = await loadData(repo);
    return { ...monthDashboard(data, month, today), annual: annualComparison(data, Number(month.slice(0, 4)), today) };
  },
  async annual(repo: Repo, year: number, today?: string) {
    return annualComparison(await loadData(repo), year, today);
  },
  async calendar(repo: Repo, from: string, to: string, today: string) {
    if (!isISODate(from) || !isISODate(to) || to < from || diffDays(to, from) > 62) throw badRequest('Intervalo do calendário inválido');
    return calendar(await loadData(repo), from, to, today);
  },
};

export type { Sale, Opportunity };
