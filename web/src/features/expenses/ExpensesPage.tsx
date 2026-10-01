import clsx from 'clsx';
import { CheckCircle2, Eye, Plus, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQuickActions } from '../../components/layout/QuickActions';
import { ChipGroup, PageHeader, SearchInput } from '../../components/ui/ListToolbar';
import { useConfirm } from '../../components/ui/modal';
import { Button, Card, EmptyState, ErrorState, IconButton, Pill, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { brl$, brlC, dateBR, monthLabel } from '../../lib/format';
import { COLORS, EXP_SITUATION } from '../../lib/labels';
import { MonthPicker, useMonth } from '../../lib/month';
import { useExpenses, useFinMutation, useSettings } from '../../lib/queries';
import type { ExpenseRow, ExpenseSituation } from '../../lib/types';

/** Lista de despesas do mês. `personal` = Conta pessoal (dados separados da empresa). */
export function ExpensesList({ personal = false }: { personal?: boolean }) {
  const base = personal ? '/api/personal/expenses' : '/api/expenses';
  const { month } = useMonth();
  const qa = useQuickActions();
  const confirm = useConfirm();
  const [sit, setSit] = useState<ExpenseSituation[]>([]);
  const [q, setQ] = useState('');
  const list = useExpenses({ month, q: q || undefined }, base);
  const monthAll = useExpenses({ month }, base).data;
  const today = useSettings().data?.today ?? '';
  // totais do mês (mesmas regras do dashboard: em aberto = vencida e não paga)
  const e = monthAll && {
    total: sum(monthAll),
    paid: sum(monthAll.filter((x) => x.status === 'PAGA')),
    open: sum(monthAll.filter((x) => x.status !== 'PAGA' && x.dueDate < today)),
    upcoming: sum(monthAll.filter((x) => x.status !== 'PAGA' && x.dueDate >= today)),
  };
  const openNew = personal ? qa.newPersonalExpense : qa.newExpense;
  const openOne = (x: ExpenseRow): void => (personal ? qa.openPersonalExpense(x) : qa.openExpense(x));
  const pay = useFinMutation((id: string) => api.patch(`${base}/${id}/pay`, {}), { success: 'Despesa paga' });
  const unpay = useFinMutation((id: string) => api.patch(`${base}/${id}/unpay`, {}), { success: 'Pagamento desfeito' });
  const del = useFinMutation((v: { id: string; series: boolean }) => api.del<{ removed: number }>(`${base}/${v.id}${v.series ? '?series=true' : ''}`), { success: (r) => `${(r as { removed: number }).removed} despesa(s) excluída(s)` });
  const items = (list.data ?? []).filter((x) => !sit.length || sit.includes(x.situation));

  const remove = async (x: ExpenseRow) => {
    if (x.seriesId) {
      const series = await confirm({ title: 'Excluir também as próximas?', message: `"${x.name}" se repete mensalmente. Confirme para excluir esta e as próximas não pagas, ou cancele para escolher só esta.`, confirmLabel: 'Esta e as próximas' });
      if (series) return del.mutate({ id: x.id, series: true });
    }
    if (await confirm({ title: 'Excluir despesa?', message: `${x.name} — ${brl$(x.amount)} em ${dateBR(x.dueDate)}`, confirmLabel: 'Excluir' })) del.mutate({ id: x.id, series: false });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={personal ? 'Despesas do mês' : 'Despesas'}
        subtitle={personal ? 'Conta pessoal · cadastro, vencimentos e pagamentos' : 'Cadastro e vencimentos'}
        actions={
          <>
            <MonthPicker />
            <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
              Nova despesa
            </Button>
          </>
        }
      />
      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Box label="Total do mês" value={e ? brlC(e.total) : '…'} />
        <Box label="Pagas" value={e ? brlC(e.paid) : '…'} color={COLORS.received} />
        <Box label="Em aberto (vencidas)" value={e ? brlC(e.open) : '…'} color={COLORS.open} danger={!!e?.open} />
        <Box label="A vencer" value={e ? brlC(e.upcoming) : '…'} color={COLORS.upcoming} />
      </Card>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <ChipGroup label="Situação" value={sit} onChange={setSit} options={(['EM_ABERTO', 'A_VENCER', 'PAGA'] as ExpenseSituation[]).map((s) => ({ value: s, label: EXP_SITUATION[s].label }))} />
        <div className="flex-1">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar despesa, categoria ou fornecedor" />
        </div>
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <Skeleton className="h-60" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt className="h-6 w-6" />} title="Nenhuma despesa" description={`Sem despesas em ${monthLabel(month).toLowerCase()} com esse filtro.`} action={<Button onClick={openNew}>Nova despesa</Button>} />
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((x) => (
            <li key={x.id} className={clsx('card flex items-center gap-3 p-3 sm:p-3.5', x.situation === 'EM_ABERTO' && 'border-danger/40')}>
              <div className="w-14 shrink-0 text-center">
                <p className="text-[18px] font-bold leading-none text-white">{x.dueDate.slice(8)}</p>
                <p className="text-[11px] italic text-ink-muted">{x.dueDate.slice(5, 7)}/{x.dueDate.slice(2, 4)}</p>
              </div>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openOne(x)}>
                <p className="truncate font-medium text-ink-title hover:text-accent">{x.name}</p>
                <p className="label truncate">{[x.category, x.supplier, x.seriesCount ? `recorrente ${x.seriesIndex}/${x.seriesCount}` : null].filter(Boolean).join(' · ') || 'Sem categoria'}</p>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[15px] font-semibold tabular-nums text-white">{brl$(x.amount)}</span>
                <Pill tone={EXP_SITUATION[x.situation].tone}>{EXP_SITUATION[x.situation].label}</Pill>
              </div>
              <div className="flex shrink-0 flex-col sm:flex-row">
                {x.status === 'PAGA' ? (
                  <IconButton label="Desfazer pagamento" onClick={() => unpay.mutate(x.id)}>
                    <RotateCcw className="h-4 w-4" />
                  </IconButton>
                ) : (
                  <IconButton label="Marcar como paga" className="text-success" onClick={() => pay.mutate(x.id)}>
                    <CheckCircle2 className="h-5 w-5" />
                  </IconButton>
                )}
                <IconButton label="Consultar / editar" className="hidden sm:inline-flex" onClick={() => openOne(x)}>
                  <Eye className="h-[18px] w-[18px]" />
                </IconButton>
                <IconButton label="Excluir" className="hidden sm:inline-flex" onClick={() => remove(x)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Box({ label, value, color, danger }: { label: string; value: string; color?: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="label flex items-center gap-1.5 truncate">
        {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
        {label}
      </p>
      <p className={clsx('kpi-value truncate text-[17px] sm:text-[20px]', danger && 'text-[#F87171]')}>{value}</p>
    </div>
  );
}

const sum = (l: ExpenseRow[]) => l.reduce((a, x) => a + Math.round(Number(x.amount) * 100), 0);

export default function ExpensesPage() {
  return <ExpensesList />;
}
