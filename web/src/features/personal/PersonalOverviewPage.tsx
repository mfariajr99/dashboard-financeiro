import clsx from 'clsx';
import { CreditCard, Pencil, PiggyBank, Plus, Receipt, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuickActions } from '../../components/layout/QuickActions';
import { PageHeader } from '../../components/ui/ListToolbar';
import { Checkbox, Field } from '../../components/ui/form';
import { Modal } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Card, ErrorState, IconButton, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { brlC, monthLabel, pct } from '../../lib/format';
import { COLORS } from '../../lib/labels';
import { MonthPicker, useMonth } from '../../lib/month';
import { useFinMutation, usePersonalOverview } from '../../lib/queries';

/** Conta pessoal → Visão geral: retirada, despesas, dívidas e saving de cada mês. */
export default function PersonalOverviewPage() {
  const { month, setMonth } = useMonth();
  const qa = useQuickActions();
  const year = Number(month.slice(0, 4));
  const ov = usePersonalOverview(year);
  const [editing, setEditing] = useState(false);
  const m = ov.data?.months.find((x) => x.month === month);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Visão geral"
        subtitle="Conta pessoal · separada do dashboard da empresa"
        actions={
          <>
            <MonthPicker />
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={qa.newPersonalExpense}>
              Despesa
            </Button>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={qa.newDebt}>
              Dívida
            </Button>
          </>
        }
      />

      {ov.isError ? (
        <ErrorState onRetry={() => ov.refetch()} />
      ) : !m || !ov.data ? (
        <Skeleton className="h-56" />
      ) : (
        <>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-semibold text-ink-title">{monthLabel(month)}</p>
              <p className="label">Saldo devedor total: {brlC(ov.data.debts.balance)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Tile
                icon={<Wallet className="h-4 w-4" />}
                label="Valor da retirada"
                value={brlC(m.withdrawal)}
                hint={m.withdrawal ? 'Entrada do mês' : 'Toque no lápis para informar'}
                action={
                  <IconButton label="Editar retirada" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                }
              />
              <Tile icon={<Receipt className="h-4 w-4" />} label="Total de despesas" value={brlC(m.expensesTotal)} hint={`${m.expensesCount} despesa(s)`} color={COLORS.expense} />
              <Tile label="Despesas já pagas" value={brlC(m.expensesPaid)} hint={`Falta pagar ${brlC(m.expensesOpen)}`} color={COLORS.received} danger={m.expensesOverdue > 0 ? `${brlC(m.expensesOverdue)} vencido` : undefined} />
              <Tile icon={<CreditCard className="h-4 w-4" />} label="Total de dívidas" value={brlC(m.debtsTotal)} hint={`${m.debtsCount} parcela(s) no mês`} color={COLORS.open} />
              <Tile label="Dívidas quitadas" value={brlC(m.debtsPaid)} hint={`Falta ${brlC(m.debtsOpen)}`} color={COLORS.received} />
              <Tile icon={<PiggyBank className="h-4 w-4" />} label="Saving" value={brlC(m.saving)} hint={m.savingRate === null ? 'Informe a retirada' : `${pct(m.savingRate, 1)} da retirada`} tone={m.saving < 0 ? 'neg' : 'pos'} />
            </div>
            <p className="mt-3 text-[12px] italic text-ink-faint">
              Saving = retirada {brlC(m.withdrawal)} − despesas {brlC(m.expensesTotal)} − dívidas {brlC(m.debtsTotal)} ={' '}
              <span className={m.saving < 0 ? 'text-[#F87171]' : 'text-[#34D399]'}>{brlC(m.saving)}</span>
            </p>
          </Card>

          <Card className="p-4">
            <p className="mb-3 font-semibold text-ink-title">Mês a mês — {year}</p>
            {/* Desktop: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[13px] tabular-nums">
                <thead>
                  <tr className="text-left text-ink-muted [&>th]:px-2 [&>th]:py-2 [&>th]:font-medium">
                    <th>Mês</th>
                    <th className="text-right">Retirada</th>
                    <th className="text-right">Despesas</th>
                    <th className="text-right">Pagas</th>
                    <th className="text-right">Dívidas</th>
                    <th className="text-right">Quitadas</th>
                    <th className="text-right">Saving</th>
                    <th className="text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.data.months.map((r) => (
                    <tr
                      key={r.month}
                      onClick={() => setMonth(r.month)}
                      className={clsx('cursor-pointer border-t border-line hover:bg-elevated [&>td]:px-2 [&>td]:py-2', r.month === month && 'bg-primary-soft')}
                    >
                      <td className="font-medium text-ink-title">{monthLabel(r.month, true)}</td>
                      <td className="text-right">{brlC(r.withdrawal)}</td>
                      <td className="text-right">{brlC(r.expensesTotal)}</td>
                      <td className="text-right text-ink-soft">{brlC(r.expensesPaid)}</td>
                      <td className="text-right">{brlC(r.debtsTotal)}</td>
                      <td className="text-right text-ink-soft">{brlC(r.debtsPaid)}</td>
                      <td className={clsx('text-right font-semibold', r.saving < 0 ? 'text-[#F87171]' : 'text-[#34D399]')}>{brlC(r.saving)}</td>
                      <td className="text-right text-ink-muted">{pct(r.savingRate, 0)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line font-semibold text-white [&>td]:px-2 [&>td]:py-2">
                    <td>Total {year}</td>
                    <td className="text-right">{brlC(ov.data.totals.withdrawal)}</td>
                    <td className="text-right">{brlC(ov.data.totals.expensesTotal)}</td>
                    <td className="text-right">{brlC(ov.data.totals.expensesPaid)}</td>
                    <td className="text-right">{brlC(ov.data.totals.debtsTotal)}</td>
                    <td className="text-right">{brlC(ov.data.totals.debtsPaid)}</td>
                    <td className={clsx('text-right', ov.data.totals.saving < 0 ? 'text-[#F87171]' : 'text-[#34D399]')}>{brlC(ov.data.totals.saving)}</td>
                    <td className="text-right text-ink-muted">{pct(ov.data.totals.savingRate, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Mobile: cartões */}
            <ul className="space-y-2 md:hidden">
              {ov.data.months.map((r) => (
                <li key={r.month}>
                  <button type="button" onClick={() => setMonth(r.month)} className={clsx('focus-ring w-full rounded-xl border border-line p-3 text-left', r.month === month ? 'bg-primary-soft' : 'bg-field')}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink-title">{monthLabel(r.month, true)}</span>
                      <span className={clsx('font-semibold tabular-nums', r.saving < 0 ? 'text-[#F87171]' : 'text-[#34D399]')}>
                        {brlC(r.saving)} <span className="text-[11px] font-normal text-ink-muted">{pct(r.savingRate, 0)}</span>
                      </span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-[11.5px] tabular-nums text-ink-soft">
                      <span>Ret. {brlC(r.withdrawal)}</span>
                      <span>Desp. {brlC(r.expensesTotal)}</span>
                      <span>Dív. {brlC(r.debtsTotal)}</span>
                    </div>
                  </button>
                </li>
              ))}
              <li className="rounded-xl border border-line p-3 text-[12.5px]">
                <p className="font-semibold text-white">Total {year}</p>
                <p className="tabular-nums text-ink-soft">
                  Retirada {brlC(ov.data.totals.withdrawal)} · Despesas {brlC(ov.data.totals.expensesTotal)} · Dívidas {brlC(ov.data.totals.debtsTotal)}
                </p>
                <p className={clsx('font-semibold tabular-nums', ov.data.totals.saving < 0 ? 'text-[#F87171]' : 'text-[#34D399]')}>
                  Saving {brlC(ov.data.totals.saving)} ({pct(ov.data.totals.savingRate, 0)})
                </p>
              </li>
            </ul>
          </Card>
        </>
      )}
      <WithdrawalDialog open={editing} onClose={() => setEditing(false)} month={month} current={m ? m.withdrawal / 100 : null} />
    </div>
  );
}

function WithdrawalDialog({ open, onClose, month, current }: { open: boolean; onClose: () => void; month: string; current: number | null }) {
  const [value, setValue] = useState<number | null>(current);
  const [forward, setForward] = useState(true);
  useEffect(() => {
    if (open) {
      setValue(current);
      setForward(true);
    }
  }, [open, current]);
  const save = useFinMutation(() => api.put<{ months: number }>(`/api/personal/months/${month}`, { withdrawal: value ?? 0, applyForward: forward }), {
    success: (r) => ((r as { months: number }).months > 1 ? `Retirada aplicada em ${(r as { months: number }).months} meses` : 'Retirada atualizada'),
    onSuccess: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Valor da retirada"
      subtitle={monthLabel(month)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Retirada do mês (pró-labore / entrada pessoal)">
          <MoneyInput id="w-value" value={value} onChange={setValue} />
        </Field>
        <Checkbox label="Repetir este valor nos meses seguintes até dezembro" checked={forward} onChange={(e) => setForward(e.target.checked)} />
      </div>
    </Modal>
  );
}

function Tile({ icon, label, value, hint, color, action, tone, danger }: { icon?: ReactNode; label: string; value: string; hint?: string; color?: string; action?: ReactNode; tone?: 'pos' | 'neg'; danger?: string }) {
  return (
    <div className={clsx('relative min-w-0 rounded-xl border border-line bg-field p-3', tone === 'neg' && 'border-danger/40', tone === 'pos' && 'border-success/30')}>
      <p className="label flex items-center gap-1.5 truncate pr-8">
        {color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />}
        {icon}
        {label}
      </p>
      {action && <div className="absolute right-1 top-1">{action}</div>}
      <p className={clsx('kpi-value mt-1 truncate text-[17px] sm:text-[19px]', tone === 'neg' && 'text-[#F87171]', tone === 'pos' && 'text-[#34D399]')}>{value}</p>
      {hint && <p className="truncate text-[11.5px] text-ink-faint">{hint}</p>}
      {danger && <p className="truncate text-[11.5px] text-[#F87171]">{danger}</p>}
    </div>
  );
}
