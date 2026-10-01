/**
 * Dados de demonstração (mesmos no servidor e no HTML de teste), relativos à data de hoje:
 *  - metas de vendas e faturamento do ano anterior e do ano atual (jan–dez);
 *  - vendas efetuadas mês a mês (Pix/Boleto parcelados e Cartão com 19%), com recebimentos;
 *  - funil quente do mês atual e do próximo, com oportunidades declinadas e adiadas;
 *  - receitas recebidas, em aberto (vencidas) e a vencer; despesas fixas e variáveis.
 * Usa os próprios serviços (mesmas validações e cálculos do uso normal).
 */
import { addDays, addMonthsClamped, addMonthsToKey, monthOf, type ISODate } from './dates';
import type { Repo, RequestContext } from './repo';
import { expenses, goals, opportunities, receivables, sales } from './services';

const CLIENTS = ['Construtora Horizonte', 'Clínica Vida', 'Loja Bella Moda', 'Grupo Atlas', 'Padaria Real', 'Mercado Bom Preço', 'Tech Solutions', 'Escola Aprender', 'Hotel Mar Azul', 'Academia Força Total', 'Rede Saúde+', 'Indústria Metalfer'];

/** Gerador pseudoaleatório determinístico (mesma demo sempre). */
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export async function seedDemo(repo: Repo, today: ISODate): Promise<void> {
  const ctx: RequestContext = { today, userId: null };
  const rand = rng(20260930);
  const m0 = monthOf(today);
  const year = Number(today.slice(0, 4));
  const day = (month: string, d: number) => addMonthsClamped(`${month}-01`, 0, d);

  // Metas jan–dez do ano anterior e do atual (crescimento gradual).
  for (const y of [year - 1, year]) {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const base = (y === year ? 95000 : 80000) + i * 1500;
      return { month: `${y}-${String(i + 1).padStart(2, '0')}`, salesGoal: base, billingGoal: Math.round(base * 0.9) };
    });
    await goals.saveYear(repo, y, rows);
  }

  // Vendas efetuadas dos meses anteriores (desde janeiro do ano passado).
  const start = `${year - 1}-01`;
  for (let m = start; m < m0; m = addMonthsToKey(m, 1)) {
    const target = (Number(m.slice(0, 4)) === year ? 95000 : 80000) + (Number(m.slice(5)) - 1) * 1500;
    const n = 3 + Math.floor(rand() * 3);
    const factor = 0.78 + rand() * 0.4; // meses acima e abaixo da meta
    for (let i = 0; i < n; i++) {
      const gross = Math.round((target * factor) / n / 10) * 10;
      const method = (['PIX', 'BOLETO', 'CARTAO'] as const)[i % 3];
      const saleDate = day(m, 3 + i * 6);
      const installments = method === 'BOLETO' ? 3 : method === 'PIX' ? 1 : 1 + (i % 2);
      await sales.create(repo, ctx, {
        client: CLIENTS[(i + Number(m.slice(5))) % CLIENTS.length],
        description: method === 'CARTAO' ? 'Pacote anual (cartão)' : 'Projeto / serviço',
        grossAmount: gross,
        saleDate,
        paymentMethod: method,
        installments,
        firstDate: method === 'PIX' ? saleDate : addDays(saleDate, 30),
        force: true,
      });
    }
  }

  // Vendas do mês atual (parte da meta) — inclui o exemplo do cartão de R$ 10.000.
  const curSales: [string, number, 'PIX' | 'BOLETO' | 'CARTAO', number, number][] = [
    ['Tech Solutions', 10000, 'CARTAO', 1, -12],
    ['Mercado Bom Preço', 15000, 'PIX', 1, -8],
    ['Construtora Horizonte', 24000, 'BOLETO', 3, -5],
    ['Academia Força Total', 18000, 'CARTAO', 2, -2],
  ];
  for (const [client, gross, method, inst, offset] of curSales) {
    const saleDate = addDays(today, offset) < `${m0}-01` ? `${m0}-01` : addDays(today, offset);
    await sales.create(repo, ctx, {
      client,
      description: method === 'CARTAO' ? 'Licenças anuais (cartão)' : 'Consultoria',
      grossAmount: gross,
      saleDate,
      paymentMethod: method,
      installments: inst,
      firstDate: method === 'PIX' ? saleDate : method === 'BOLETO' ? addDays(saleDate, 5) : addDays(saleDate, 30),
      force: true,
    });
  }

  // Receitas avulsas do mês (uma vencida em aberto e uma a vencer hoje).
  await receivables.create(repo, { client: 'Escola Aprender', description: 'Workshop — boleto vencido', paymentMethod: 'BOLETO', grossAmount: 9000, dueDate: addDays(today, -3) < `${m0}-01` ? `${m0}-01` : addDays(today, -3) });
  await receivables.create(repo, { client: 'Restaurante Sabor', description: 'Cardápio digital', paymentMethod: 'PIX', grossAmount: 4200, dueDate: today });

  // Recebimentos: tudo que venceu até ontem foi recebido, exceto o boleto vencido e 1 parcela atrasada.
  const all = await repo.receivables.all();
  const keepOpen = new Set<string>();
  const overdue = all.filter((r) => r.dueDate < today && r.dueDate >= `${m0}-01`).sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  for (const r of overdue.slice(0, 2)) keepOpen.add(r.id);
  for (const r of all) if (r.dueDate < today && !keepOpen.has(r.id) && !(r.description ?? '').includes('vencido')) await receivables.receive(repo, r.id, { receivedDate: r.dueDate }, today);

  // Funil quente: mês atual e próximo.
  const next = addMonthsToKey(m0, 1);
  const opp = async (client: string, gross: number, month: string, expected: ISODate | null, owner: string, description: string) =>
    opportunities.create(repo, ctx, { client, grossAmount: gross, month, expectedDate: expected, owner, description, force: true });
  await opp('Rede Farmácias Saúde+', 48000, m0, today, 'Marcos', 'Implantação em 12 lojas');
  await opp('Indústria Metalfer', 35000, m0, today, 'Ana', 'Consultoria de custos');
  const adiada = await opp('Colégio Novo Saber', 26000, m0, today, 'Marcos', 'Plataforma EAD');
  await opportunities.setStatus(repo, adiada.id, { status: 'PROXIMO_MES' });
  const declinou = await opp('Agência Criativa', 12000, m0, null, 'Ana', 'Perdida para concorrente');
  await opportunities.setStatus(repo, declinou.id, { status: 'DECLINOU' });
  await opp('Transportadora Via Sul', 18000, next, day(next, 12), 'Ana', 'Roteirização');
  await opp('Hospital São Lucas', 22000, next, day(next, 20), 'Marcos', 'Projeto piloto');
  await opp('Varejo Top', 15000, next, day(next, 25), 'Ana', 'Treinamento comercial');

  // Despesas fixas mensais (do ano passado até 3 meses à frente) + variáveis.
  const fixed: [string, string, number, number][] = [
    ['Folha de pagamento', 'Pessoal', 26000, 5],
    ['Aluguel do escritório', 'Estrutura', 8500, 10],
    ['Simples Nacional (DAS)', 'Impostos', 7200, 20],
    ['ERP e ferramentas SaaS', 'Software', 1450, 15],
  ];
  const months: string[] = [];
  for (let m = start; m <= addMonthsToKey(m0, 3); m = addMonthsToKey(m, 1)) months.push(m);
  for (const [name, category, amount, d] of fixed) {
    const first = day(start, d);
    await expenses.create(repo, { name, category, amount, dueDate: first, repeatMonths: months.length, force: true }, today);
  }
  for (const m of months.filter((x) => x <= m0)) {
    await expenses.create(repo, { name: 'Campanha de marketing', category: 'Marketing', amount: 3000 + Math.round(rand() * 3000), dueDate: day(m, 12), force: true }, today);
    await expenses.create(repo, { name: 'Fornecedor de materiais', category: 'Fornecedores', amount: 5000 + Math.round(rand() * 6000), dueDate: day(m, 25), force: true }, today);
  }
  // Pagamentos: tudo vencido até ontem foi pago, exceto 1 despesa do mês (em aberto).
  const exps = (await repo.expenses.all()).sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  const openOne = exps.find((e) => e.dueDate < today && e.dueDate >= `${m0}-01` && e.name === 'Fornecedor de materiais');
  for (const e of exps) if (e.dueDate < today && e.id !== openOne?.id) await expenses.pay(repo, e.id, { paidDate: e.dueDate }, today);
}
