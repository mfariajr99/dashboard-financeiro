import clsx from 'clsx';
import { CheckCircle2, CreditCard, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useQuickActions } from '../../components/layout/QuickActions';
import { PageHeader, SearchInput } from '../../components/ui/ListToolbar';
import { Button, Card, EmptyState, ErrorState, IconButton, Pill, Segmented, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { brl$, brlC, dateBR, monthLabel } from '../../lib/format';
import { DEBT_STATUS } from '../../lib/labels';
import { MonthPicker, useMonth } from '../../lib/month';
import { useDebtInstallments, useDebts, useFinMutation, usePersonalOverview } from '../../lib/queries';

type Tab = 'ABERTAS' | 'QUITADA' | 'TODAS';
const cents = (v: string | null | undefined) => Math.round(Number(v ?? 0) * 100);

/** Conta pessoal → Dívidas: cadastro, consulta e parcelas do mês. */
export default function DebtsPage() {
  const qa = useQuickActions();
  const { month } = useMonth();
  const [tab, setTab] = useState<Tab>('ABERTAS');
  const [q, setQ] = useState('');
  const list = useDebts({ status: tab === 'TODAS' ? undefined : tab, q: q || undefined });
  const inst = useDebtInstallments(month);
  const ov = usePersonalOverview(Number(month.slice(0, 4))).data;
  const pay = useFinMutation((id: string) => api.patch(`/api/personal/debt-installments/${id}/pay`, {}), { success: 'Parcela paga' });
  const unpay = useFinMutation((id: string) => api.patch(`/api/personal/debt-installments/${id}/unpay`, {}), { success: 'Pagamento desfeito' });

  const monthTotal = (inst.data ?? []).reduce((a, x) => a + cents(x.amount), 0);
  const monthPaid = (inst.data ?? []).filter((x) => x.status === 'PAGA').reduce((a, x) => a + cents(x.amount), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dívidas"
        subtitle="Conta pessoal · dívidas parceladas e parcelas do mês"
        actions={
          <>
            <MonthPicker />
            <Button icon={<Plus className="h-4 w-4" />} onClick={qa.newDebt}>
              Nova dívida
            </Button>
          </>
        }
      />

      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Kpi label="Saldo devedor total" value={ov ? brlC(ov.debts.balance) : '…'} hint={ov ? `${ov.debts.openCount} dívida(s) em aberto` : ''} />
        <Kpi label="Em atraso" value={ov ? brlC(ov.debts.overdue) : '…'} danger={!!ov?.debts.overdue} />
        <Kpi label={`Parcelas de ${monthLabel(month, true)}`} value={brlC(monthTotal)} hint={`${inst.data?.length ?? 0} parcela(s)`} />
        <Kpi label="Quitadas no mês" value={brlC(monthPaid)} hint={`Falta ${brlC(monthTotal - monthPaid)}`} />
      </Card>

      <Card className="p-4">
        <p className="mb-2 font-semibold text-ink-title">Parcelas de {monthLabel(month).toLowerCase()}</p>
        {!inst.data ? (
          <Skeleton className="h-20" />
        ) : inst.data.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nenhuma parcela de dívida neste mês.</p>
        ) : (
          <ul className="divide-y divide-line">
            {inst.data.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2">
                <div className="w-12 shrink-0 text-center">
                  <p className="text-[17px] font-bold leading-none text-white">{x.dueDate.slice(8)}</p>
                  <p className="text-[11px] italic text-ink-muted">{x.dueDate.slice(5, 7)}/{x.dueDate.slice(2, 4)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-title">{x.debtName}</p>
                  <p className="label truncate">{[x.creditor, `parcela ${x.number}/${x.count}`].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[14.5px] font-semibold tabular-nums text-white">{brl$(x.amount)}</span>
                  <Pill tone={x.situation === 'PAGA' ? 'success' : x.situation === 'EM_ABERTO' ? 'danger' : 'info'}>{x.situation === 'PAGA' ? 'Paga' : x.situation === 'EM_ABERTO' ? 'Atrasada' : 'A vencer'}</Pill>
                </div>
                {x.status === 'PAGA' ? (
                  <IconButton label="Desfazer pagamento" onClick={() => unpay.mutate(x.id)}>
                    <RotateCcw className="h-4 w-4" />
                  </IconButton>
                ) : (
                  <IconButton label="Marcar como paga" className="text-success" onClick={() => pay.mutate(x.id)}>
                    <CheckCircle2 className="h-5 w-5" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ABERTAS', label: 'Em aberto' },
            { value: 'QUITADA', label: 'Quitadas' },
            { value: 'TODAS', label: 'Todas' },
          ]}
        />
        <div className="flex-1">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar dívida ou credor" />
        </div>
      </div>

      {list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <Skeleton className="h-40" />
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState icon={<CreditCard className="h-6 w-6" />} title="Nenhuma dívida" description="Cadastre empréstimos, cartões, financiamentos ou valores devidos a pessoas." action={<Button onClick={qa.newDebt}>Nova dívida</Button>} />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((d) => {
            const total = cents(d.totalAmount);
            const paid = cents(d.paidAmount);
            const pctPaid = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
            return (
              <li key={d.id}>
                <button type="button" onClick={() => qa.openDebt(d)} className={clsx('card focus-ring flex h-full w-full flex-col p-4 text-left hover:border-accent/50', d.status === 'ATRASADA' && 'border-danger/40')}>
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-title">{d.name}</p>
                      <p className="label truncate">{d.creditor || 'Sem credor'}</p>
                    </div>
                    <Pill tone={DEBT_STATUS[d.status].tone}>{DEBT_STATUS[d.status].label}</Pill>
                  </div>
                  <p className="kpi-value mt-3 text-[20px]">{brl$(d.remainingAmount)}</p>
                  <p className="label">falta pagar de {brl$(d.totalAmount)}</p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-field" aria-hidden>
                    <div className="h-full rounded-full bg-[#10B981]" style={{ width: `${pctPaid}%` }} />
                  </div>
                  <p className="mt-2 text-[12px] text-ink-muted">
                    {d.paidCount}/{d.installments} parcelas pagas
                    {d.nextDueDate ? ` · próxima ${dateBR(d.nextDueDate)} (${brl$(d.nextAmount)})` : ''}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="label truncate">{label}</p>
      <p className={clsx('kpi-value truncate text-[17px] sm:text-[20px]', danger && 'text-[#F87171]')}>{value}</p>
      {hint && <p className="truncate text-[11.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}
