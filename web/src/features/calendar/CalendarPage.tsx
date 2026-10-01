import clsx from 'clsx';
import { CalendarDays, List } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuickActions } from '../../components/layout/QuickActions';
import { PageHeader } from '../../components/ui/ListToolbar';
import { Modal } from '../../components/ui/modal';
import { Card, EmptyState, ErrorState, Segmented, Skeleton } from '../../components/ui/primitives';
import { addDays, monthEnd, monthOf, monthStart, startOfWeek } from '../../lib/dates';
import { brlC, brlCompactC, dateBR, dayMonth, WEEKDAYS_SHORT, weekdayLong } from '../../lib/format';
import { MonthPicker, useMonth } from '../../lib/month';
import { useCalendar } from '../../lib/queries';
import type { CalendarDay, CalendarItem } from '../../lib/types';

/** Cores e legenda do calendário. */
const KIND: Record<string, { label: string; color: string }> = {
  'RECEITA:RECEBIDO': { label: 'Receita recebida', color: '#10B981' },
  'RECEITA:A_VENCER': { label: 'Receita a receber', color: '#38BDF8' },
  'RECEITA:EM_ABERTO': { label: 'Receita em aberto', color: '#EF4444' },
  'DESPESA:PAGA': { label: 'Despesa paga', color: '#94A3B8' },
  'DESPESA:A_VENCER': { label: 'Despesa a pagar', color: '#F59E0B' },
  'DESPESA:EM_ABERTO': { label: 'Despesa vencida', color: '#F43F5E' },
  'VENDA:EFETUADA': { label: 'Venda efetuada', color: '#0A9AD8' },
  'OPORTUNIDADE:ABERTA': { label: 'Funil (previsão)', color: '#8B5CF6' },
};
const kindOf = (i: CalendarItem) => KIND[`${i.kind}:${i.situation}`] ?? { label: i.kind, color: '#CBD5E1' };

export default function CalendarPage() {
  const { month } = useMonth();
  const [view, setView] = useState<'mes' | 'lista'>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'lista' : 'mes'));
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const range = useMemo(
    () => (view === 'mes' ? { from: startOfWeek(monthStart(month)), to: addDays(startOfWeek(monthEnd(month)), 6) } : { from: monthStart(month), to: monthEnd(month) }),
    [view, month],
  );
  const cal = useCalendar(range.from, range.to);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendário"
        subtitle="Receitas, despesas, vendas e previsões do funil"
        actions={
          <>
            <MonthPicker />
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'mes', label: <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />Mês</span> },
                { value: 'lista', label: <span className="flex items-center gap-1.5"><List className="h-4 w-4" />Lista</span> },
              ]}
            />
          </>
        }
      />
      <ul className="scroll-x" aria-label="Legenda">
        {Object.values(KIND).map((k) => (
          <li key={k.label} className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: k.color }} />
            {k.label}
          </li>
        ))}
      </ul>
      {cal.isError ? (
        <ErrorState onRetry={() => cal.refetch()} />
      ) : !cal.data ? (
        <Skeleton className="h-[480px]" />
      ) : view === 'mes' ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-field/60 text-center text-[11px] italic text-ink-muted">
            {WEEKDAYS_SHORT.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cal.data.days.map((d) => {
              const out = monthOf(d.date) !== month;
              const colors = [...new Set(d.items.map((i) => kindOf(i).color))];
              return (
                <button
                  type="button"
                  key={d.date}
                  onClick={() => setSelected(d)}
                  aria-label={`${dateBR(d.date)}: ${d.items.length} lançamento(s)`}
                  className={clsx('focus-ring flex min-h-[62px] flex-col gap-1 border-b border-r border-line/60 p-1.5 text-left hover:bg-elevated/70 sm:min-h-[100px] sm:p-2 [&:nth-child(7n)]:border-r-0', out && 'opacity-40', d.isToday && 'bg-primary-soft')}
                >
                  <span className="flex items-center gap-1">
                    <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold', d.isToday ? 'bg-primary text-white' : d.holiday ? 'text-[#FBBF24]' : 'text-ink-soft')}>{Number(d.date.slice(8))}</span>
                    {d.holiday && <span className="hidden truncate text-[10px] italic text-[#FBBF24] lg:inline">{d.holiday}</span>}
                  </span>
                  <span className="flex flex-wrap gap-0.5">
                    {colors.slice(0, 6).map((c) => (
                      <span key={c} className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="mt-auto hidden flex-col text-[10.5px] leading-tight tabular-nums sm:flex">
                    {d.inflow > 0 && <span className="text-[#34D399]">+{brlCompactC(d.inflow)}</span>}
                    {d.outflow > 0 && <span className="text-[#FBBF24]">−{brlCompactC(d.outflow)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      ) : cal.data.days.every((d) => !d.items.length) ? (
        <Card>
          <EmptyState title="Nada programado no mês" />
        </Card>
      ) : (
        <ul className="space-y-2">
          {cal.data.days
            .filter((d) => d.items.length)
            .map((d) => (
              <li key={d.date} className={clsx('card p-2', d.isToday && 'border-primary')}>
                <button type="button" onClick={() => setSelected(d)} className="focus-ring flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-2 text-left">
                  <span className="text-[13px] font-semibold text-ink-title">
                    {dayMonth(d.date)} · {weekdayLong(d.date)}
                    {d.isToday && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10.5px] text-white">hoje</span>}
                    {d.holiday && <span className="ml-2 text-[11px] italic text-[#FBBF24]">{d.holiday}</span>}
                  </span>
                  <span className="text-[12px] tabular-nums">
                    {d.inflow > 0 && <span className="text-[#34D399]">+{brlC(d.inflow)} </span>}
                    {d.outflow > 0 && <span className="text-[#FBBF24]">−{brlC(d.outflow)}</span>}
                  </span>
                </button>
                <ItemList items={d.items} />
              </li>
            ))}
        </ul>
      )}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${dateBR(selected.date)} · ${weekdayLong(selected.date)}` : ''} subtitle={selected?.holiday ?? 'Programação do dia'}>
        {selected && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 rounded-xl border border-line bg-field p-3">
              <div>
                <p className="label">Receitas do dia</p>
                <p className="kpi-value text-[16px] text-[#34D399]">{brlC(selected.inflow)}</p>
              </div>
              <div>
                <p className="label">Despesas do dia</p>
                <p className="kpi-value text-[16px] text-[#FBBF24]">{brlC(selected.outflow)}</p>
              </div>
            </div>
            {selected.items.length ? <ItemList items={selected.items} onOpen={() => setSelected(null)} /> : <p className="text-[13px] italic text-ink-muted">Nada programado neste dia.</p>}
          </>
        )}
      </Modal>
    </div>
  );
}

function ItemList({ items, onOpen }: { items: CalendarItem[]; onOpen?: () => void }) {
  const qa = useQuickActions();
  return (
    <ul className="space-y-0.5">
      {items.map((i) => {
        const k = kindOf(i);
        return (
          <li key={i.kind + i.id}>
            <button
              type="button"
              onClick={() => {
                onOpen?.();
                qa.openById(i.kind, i.id);
              }}
              className="focus-ring flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-surface"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: k.color }} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink-body">{i.label}</span>
                  <span className="block truncate text-[11px] italic text-ink-muted">
                    {k.label}
                    {i.detail ? ` · ${i.detail}` : ''}
                  </span>
                </span>
              </span>
              <span className={clsx('shrink-0 text-[13px] font-semibold tabular-nums', i.kind === 'RECEITA' ? 'text-[#34D399]' : i.kind === 'DESPESA' ? 'text-[#FBBF24]' : 'text-white')}>
                {i.kind === 'RECEITA' ? '+' : i.kind === 'DESPESA' ? '−' : ''}
                {brlC(i.amount)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
