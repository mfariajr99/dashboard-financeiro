import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, CalendarCheck2, Flame, PiggyBank, Target, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '../../components/ui/ListToolbar';
import { Card, CardHeader, ErrorState, Segmented, Skeleton } from '../../components/ui/primitives';
import { axisMoney, brlC, brlCompactC, monthLabel, pct, pctGoal } from '../../lib/format';
import { COLORS } from '../../lib/labels';
import { MonthPicker, useMonth } from '../../lib/month';
import { useAnnual, useDashboard } from '../../lib/queries';
import type { Annual, Dashboard } from '../../lib/types';

export function DashboardPage() {
  const { month } = useMonth();
  const q = useDashboard(month);
  const d = q.data;
  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle={`Visão do mês de ${monthLabel(month).toLowerCase()}`} actions={<MonthPicker />} />
      {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!d ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <BillingCard d={d} />
            <SalesCard d={d} />
            <ResultCard d={d} />
          </div>
          <AnnualCard initial={d.annual} />
        </>
      )}
    </div>
  );
}

/** Barra empilhada com legenda — partes de um total. */
function StackBar({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number }) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-field" role="img" aria-label={parts.map((p) => `${p.label} ${brlC(p.value)}`).join(', ')}>
      {total > 0 && parts.map((p) => p.value > 0 && <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="h-full border-r-2 border-surface last:border-r-0" />)}
    </div>
  );
}

function Row({ color, label, value, hint, strong }: { color?: string; label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-soft">
        {color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />}
        <span className="truncate">{label}</span>
        {hint && <span className="shrink-0 text-[11.5px] text-ink-faint">{hint}</span>}
      </span>
      <span className={clsx('shrink-0 tabular-nums', strong ? 'text-[15px] font-bold text-white' : 'text-[13.5px] font-semibold text-ink-body')}>{value}</span>
    </li>
  );
}

// 1) O que temos a faturar no mês: recebido, em aberto e a vencer.
function BillingCard({ d }: { d: Dashboard }) {
  const b = d.billing;
  return (
    <Card className="flex flex-col">
      <CardHeader title="Faturamento do mês" subtitle="Receitas programadas (valor líquido)" icon={<Wallet className="h-5 w-5" />} actions={<Link to="/faturamento" className="text-[12px] font-medium text-accent hover:underline">Ver receitas</Link>} />
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5">
        <p className="label">Total a faturar no mês</p>
        <p className="kpi-value whitespace-nowrap text-[30px] sm:text-[34px]">{brlC(b.total)}</p>
        <div className="mt-3">
          <StackBar total={b.total} parts={[{ label: 'Recebido', value: b.received, color: COLORS.received }, { label: 'Em aberto', value: b.open, color: COLORS.open }, { label: 'A vencer', value: b.upcoming, color: COLORS.upcoming }]} />
        </div>
        <ul className="mt-2 divide-y divide-line">
          <Row color={COLORS.received} label="Já recebido" value={brlC(b.received)} hint={b.total ? pct(b.received / b.total) : undefined} />
          <Row color={COLORS.open} label="Em aberto (vencido)" value={brlC(b.open)} hint={b.openCount ? `${b.openCount} receita(s)` : undefined} />
          <Row color={COLORS.upcoming} label="Ainda vai vencer" value={brlC(b.upcoming)} />
        </ul>
        <div className="mt-auto border-t border-line pt-3">
          <p className="label mb-1">Meta de faturamento</p>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-ink-soft">
              {d.billingGoal.goal ? (
                <>
                  {pctGoal(d.billingGoal.percent)} de {brlC(d.billingGoal.goal)}
                </>
              ) : (
                'Sem meta cadastrada'
              )}
            </span>
            <span className={clsx('font-semibold tabular-nums', d.billingGoal.remaining > 0 ? 'text-[#FBBF24]' : 'text-[#34D399]')}>
              {d.billingGoal.goal ? (d.billingGoal.remaining > 0 ? `Falta ${brlC(d.billingGoal.remaining)}` : 'Meta atingida') : ''}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// 2) Funil quente × Venda efetuada × Meta.
function SalesCard({ d }: { d: Dashboard }) {
  const s = d.sales;
  const scale = Math.max(s.goal, s.sold + s.funnel, 1);
  const done = s.goal > 0 && s.sold >= s.goal;
  return (
    <Card className="flex flex-col">
      <CardHeader title="Funil × Vendas × Meta" subtitle="Meta de vendas do mês (valor bruto)" icon={<Target className="h-5 w-5" />} actions={<Link to="/funil" className="text-[12px] font-medium text-accent hover:underline">Ver funil</Link>} />
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5">
        <p className="label">Vendas efetuadas</p>
        <p className="kpi-value whitespace-nowrap text-[30px] sm:text-[34px]">{brlC(s.sold)}</p>
        <p className="text-[12.5px] text-ink-muted">
          Meta do mês <b className="text-white">{s.goal ? brlC(s.goal) : '— (cadastre em Metas)'}</b>
        </p>
        <div className="relative mt-3 h-5 w-full overflow-hidden rounded-full bg-field" role="img" aria-label={`Vendido ${brlC(s.sold)}, funil ${brlC(s.funnel)}, meta ${brlC(s.goal)}`}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${(s.sold / scale) * 100}%`, background: COLORS.sold }} />
          <div
            className="absolute inset-y-0 border-l-2 border-surface"
            style={{ left: `${(s.sold / scale) * 100}%`, width: `${(s.funnel / scale) * 100}%`, background: `repeating-linear-gradient(135deg, ${COLORS.funnel} 0 6px, rgba(139,92,246,0.55) 6px 12px)` }}
          />
          {s.goal > 0 && <div className="absolute inset-y-[-2px] w-[3px] rounded bg-white" style={{ left: `calc(${Math.min(100, (s.goal / scale) * 100)}% - 2px)` }} title="Meta" />}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.sold }} />Vendido {pctGoal(s.percent)}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.funnel }} />Funil quente</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-[3px] rounded-sm bg-white" />Meta</span>
        </div>
        <ul className="mt-2 divide-y divide-line">
          <Row color={COLORS.funnel} label="Funil quente em aberto" value={brlC(s.funnel)} hint={`${s.funnelCount} oport.`} />
          <Row label="Falta para a meta" value={done ? 'Meta atingida' : brlC(s.remaining)} strong />
          <Row label="Funil cobre o que falta" value={done ? '—' : s.funnelCoverage === null ? '—' : pct(s.funnelCoverage)} />
        </ul>
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3">
          <div className="rounded-xl bg-field p-2.5">
            <p className="label flex items-center gap-1"><CalendarCheck2 className="h-3.5 w-3.5" /> Dias úteis restantes</p>
            <p className="kpi-value text-[20px]">{d.days.businessDaysRemaining}<span className="text-[12px] font-normal text-ink-faint"> de {d.days.businessDaysTotal}</span></p>
          </div>
          <div className="rounded-xl bg-field p-2.5">
            <p className="label">Vender por dia útil</p>
            <p className="kpi-value text-[16px]">{done || !d.days.businessDaysRemaining ? '—' : brlC(s.perBusinessDay)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// 3) Faturamento previsto × Despesas = Lucro ou prejuízo.
function ResultCard({ d }: { d: Dashboard }) {
  const r = d.result;
  const profit = r.profit >= 0;
  const e = d.expenses;
  return (
    <Card className="flex flex-col">
      <CardHeader title="Resultado do mês" subtitle="Faturamento previsto − despesas" icon={<PiggyBank className="h-5 w-5" />} actions={<Link to="/despesas" className="text-[12px] font-medium text-accent hover:underline">Ver despesas</Link>} />
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5">
        <ul className="divide-y divide-line">
          <Row color={COLORS.received} label="Faturamento previsto" value={brlC(r.revenue)} />
          <Row color={COLORS.expense} label="Despesas do mês" value={`− ${brlC(r.costs)}`} />
        </ul>
        <div className={clsx('mt-3 rounded-xl border p-3', profit ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft')}>
          <p className="label flex items-center gap-1">
            {profit ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-danger" />}
            {profit ? 'Lucro previsto' : 'Prejuízo previsto'}
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <p className={clsx('kpi-value text-[28px]', profit ? 'text-[#34D399]' : 'text-[#F87171]')}>{brlC(r.profit)}</p>
            <p className={clsx('text-[18px] font-bold tabular-nums', profit ? 'text-[#34D399]' : 'text-[#F87171]')}>{r.margin === null ? '—' : pct(r.margin, 1)}</p>
          </div>
          <p className="text-[11.5px] text-ink-muted">Margem sobre o faturamento previsto</p>
        </div>
        <div className="mt-auto border-t border-line pt-3">
          <p className="label mb-1.5">Despesas do mês</p>
          <StackBar total={e.total} parts={[{ label: 'Pagas', value: e.paid, color: COLORS.received }, { label: 'Em aberto', value: e.open, color: COLORS.open }, { label: 'A vencer', value: e.upcoming, color: COLORS.upcoming }]} />
          <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11.5px] text-ink-soft">
            <span>Pagas<br /><b className="tabular-nums text-ink-body">{brlCompactC(e.paid)}</b></span>
            <span>Em aberto<br /><b className={clsx('tabular-nums', e.open ? 'text-[#F87171]' : 'text-ink-body')}>{brlCompactC(e.open)}</b></span>
            <span>A vencer<br /><b className="tabular-nums text-ink-body">{brlCompactC(e.upcoming)}</b></span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// 4) Comparativo do ano: Meta × Venda mês a mês e acumulado.
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function AnnualCard({ initial }: { initial: Annual }) {
  const [year, setYear] = useState(initial.year);
  const [view, setView] = useState<'mensal' | 'acumulado'>('mensal');
  const q = useAnnual(year);
  const a = q.data ?? (year === initial.year ? initial : undefined);
  const years = Array.from(new Set([...(a?.years ?? initial.years), year])).sort();
  const data = (a?.months ?? []).map((m, i) => ({ ...m, name: MONTHS[i] }));
  const tooltip = {
    cursor: { fill: 'rgba(56,189,248,0.06)' },
    contentStyle: { background: '#17254B', border: '1px solid #1F2E54', borderRadius: 12, fontSize: 12, fontFamily: 'Montserrat' },
    labelStyle: { color: '#F8FAFC', fontWeight: 600 },
    formatter: (v: unknown, n: unknown) => [brlC(Number(v ?? 0)), String(n)] as [string, string],
  };
  const axis = { stroke: '#64748B', tick: { fill: '#64748B', fontSize: 11, fontFamily: 'Montserrat' }, tickLine: false, axisLine: false } as const;

  return (
    <Card>
      <CardHeader
        title={`Meta × Venda — ${year}`}
        subtitle="Janeiro a dezembro · valores brutos das vendas efetuadas"
        icon={<Flame className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={String(year)} onChange={(v) => setYear(Number(v))} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
            <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'mensal', label: 'Mês a mês' }, { value: 'acumulado', label: 'Acumulado' }]} />
          </div>
        }
      />
      <div className="px-3 pb-4 pt-3 sm:px-5">
        {!a ? (
          <Skeleton className="h-72" />
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-field p-3">
                <p className="label">Meta do ano</p>
                <p className="kpi-value text-[16px] sm:text-[20px]">{brlC(a.totalGoal)}</p>
              </div>
              <div className="rounded-xl bg-field p-3">
                <p className="label">Vendido no ano</p>
                <p className="kpi-value text-[16px] sm:text-[20px]">{brlC(a.totalSold)}</p>
              </div>
              <div className="rounded-xl bg-field p-3">
                <p className="label">Atingido</p>
                <p className={clsx('kpi-value text-[16px] sm:text-[20px]', (a.percent ?? 0) >= 1 ? 'text-[#34D399]' : '')}>{pctGoal(a.percent)}</p>
              </div>
            </div>
            <ul className="mb-2 flex gap-4 text-[11.5px] text-ink-soft">
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.goal }} />{view === 'mensal' ? 'Meta' : 'Meta acumulada'}</li>
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.sold }} />{view === 'mensal' ? 'Venda' : 'Venda acumulada'}</li>
            </ul>
            <div className="h-[260px]" role="img" aria-label={`Meta e venda por mês em ${year}`}>
              <ResponsiveContainer width="100%" height="100%">
                {view === 'mensal' ? (
                  <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
                    <CartesianGrid stroke="#1F2E54" strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="name" {...axis} />
                    <YAxis {...axis} width={44} tickFormatter={(v) => axisMoney(v)} />
                    <Tooltip {...tooltip} />
                    <Bar dataKey="goal" name="Meta" fill={COLORS.goal} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="sold" name="Venda" fill={COLORS.sold} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                ) : (
                  <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1F2E54" strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="name" {...axis} />
                    <YAxis {...axis} width={44} tickFormatter={(v) => axisMoney(v)} />
                    <Tooltip {...tooltip} />
                    <Line type="monotone" dataKey="cumulativeGoal" name="Meta acumulada" stroke={COLORS.goal} strokeDasharray="5 5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cumulativeSold" name="Venda acumulada" stroke={COLORS.sold} strokeWidth={2.5} dot={{ r: 3, stroke: '#111C38', strokeWidth: 2 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <table className="w-full text-[12px] sm:text-[13px]">
                <thead className="bg-field/70 text-left text-[11px] italic text-ink-muted sm:text-[12px]">
                  <tr>
                    <th className="px-2 py-2 font-normal sm:px-3">Mês</th>
                    <th className="px-2 py-2 text-right font-normal">Meta</th>
                    <th className="px-2 py-2 text-right font-normal">Venda</th>
                    <th className="px-2 py-2 text-right font-normal">% meta</th>
                    <th className="px-2 py-2 text-right font-normal sm:px-3">Cresc. m/m</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((m) => (
                    <tr key={m.month} className="border-t border-line/60 tabular-nums">
                      <td className="px-2 py-1.5 sm:px-3">{m.name}</td>
                      <td className="px-2 py-1.5 text-right text-ink-muted"><span className="sm:hidden">{brlCompactC(m.goal)}</span><span className="hidden sm:inline">{brlC(m.goal)}</span></td>
                      <td className="px-2 py-1.5 text-right font-semibold text-white"><span className="sm:hidden">{brlCompactC(m.sold)}</span><span className="hidden sm:inline">{brlC(m.sold)}</span></td>
                      <td className={clsx('px-2 py-1.5 text-right', m.percent !== null && m.percent >= 1 ? 'text-[#34D399]' : m.percent !== null && m.sold > 0 ? 'text-[#FBBF24]' : 'text-ink-faint')}>{m.sold || m.goal ? pctGoal(m.percent) : '—'}</td>
                      <td className={clsx('px-2 py-1.5 text-right sm:px-3', m.growth === null ? 'text-ink-faint' : m.growth >= 0 ? 'text-[#34D399]' : 'text-[#F87171]')}>
                        {m.growth === null ? '—' : `${m.growth >= 0 ? '▲' : '▼'} ${pct(Math.abs(m.growth), 1)}`}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-line bg-field/70 font-semibold tabular-nums text-white">
                    <td className="px-2 py-2 sm:px-3">Total</td>
                    <td className="px-2 py-2 text-right"><span className="sm:hidden">{brlCompactC(a.totalGoal)}</span><span className="hidden sm:inline">{brlC(a.totalGoal)}</span></td>
                    <td className="px-2 py-2 text-right"><span className="sm:hidden">{brlCompactC(a.totalSold)}</span><span className="hidden sm:inline">{brlC(a.totalSold)}</span></td>
                    <td className="px-2 py-2 text-right">{pctGoal(a.percent)}</td>
                    <td className="px-2 py-2 sm:px-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
