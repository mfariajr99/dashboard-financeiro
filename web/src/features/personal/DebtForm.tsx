import clsx from 'clsx';
import { CheckCircle2, CreditCard, Landmark, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, IconButton, Pill } from '../../components/ui/primitives';
import { monthOptions } from '../../components/ui/RecurrenceFields';
import { api, ApiError } from '../../lib/api';
import { addMonths, monthOf, todayLocal } from '../../lib/dates';
import { brl$, brlC, dateBR, monthLabel } from '../../lib/format';
import { DEBT_STATUS } from '../../lib/labels';
import { useDebt, useFinMutation, useSettings } from '../../lib/queries';
import type { DebtRow } from '../../lib/types';

/** Dívida pessoal: cadastro, consulta (parcelas pagas/em aberto) e edição. */
export function DebtForm({ open, onClose, debt }: { open: boolean; onClose: () => void; debt?: DebtRow | null }) {
  const settings = useSettings();
  const confirm = useConfirm();
  const today = settings.data?.today ?? todayLocal();
  const detail = useDebt(open && debt ? debt.id : null);
  const [f, setF] = useState({ name: '', creditor: '', total: null as number | null, installments: 1, dueDay: 10, startMonth: monthOf(today), paidCount: 0, notes: '' });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(
      debt
        ? { name: debt.name, creditor: debt.creditor ?? '', total: Number(debt.totalAmount), installments: debt.installments, dueDay: debt.dueDay, startMonth: debt.startMonth, paidCount: 0, notes: debt.notes ?? '' }
        : { name: '', creditor: '', total: null, installments: 1, dueDay: Number(today.slice(8, 10)) || 10, startMonth: monthOf(today), paidCount: 0, notes: '' },
    );
  }, [open, debt, today]);

  const save = useFinMutation(
    () => {
      const body = { name: f.name, creditor: f.creditor, totalAmount: f.total ?? 0, installments: f.installments, dueDay: f.dueDay, startMonth: f.startMonth, paidCount: f.paidCount, notes: f.notes };
      return debt ? api.put(`/api/personal/debts/${debt.id}`, body) : api.post('/api/personal/debts', body);
    },
    { success: debt ? 'Dívida atualizada' : `Dívida cadastrada em ${f.installments} parcela(s)`, onSuccess: onClose },
  );
  const del = useFinMutation(() => api.del(`/api/personal/debts/${debt!.id}`), { success: 'Dívida excluída', onSuccess: onClose });
  const pay = useFinMutation((id: string) => api.patch(`/api/personal/debt-installments/${id}/pay`, {}), { success: 'Parcela paga' });
  const unpay = useFinMutation((id: string) => api.patch(`/api/personal/debt-installments/${id}/unpay`, {}), { success: 'Pagamento desfeito' });

  const submit = async () => {
    if (!f.name.trim()) return setErr('Informe a dívida');
    if (!f.total || f.total <= 0) return setErr('Informe o valor total');
    if (!f.installments || f.installments < 1) return setErr('Informe o número de parcelas');
    if (f.paidCount > f.installments) return setErr('As parcelas já pagas não podem passar do total');
    setErr(null);
    try {
      await save.mutateAsync(undefined);
    } catch (e) {
      if (e instanceof ApiError) setErr(e.message);
    }
  };

  const totalCents = Math.round((f.total ?? 0) * 100);
  const parcel = f.installments > 0 ? Math.floor(totalCents / f.installments) : 0;
  const lastMonth = addMonths(f.startMonth, Math.max(0, f.installments - 1));
  const d = detail.data;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={debt ? 'Consultar / editar dívida' : 'Nova dívida'}
      subtitle="Conta pessoal · dívidas parceladas"
      footer={
        <>
          {debt && (
            <Button
              variant="ghost"
              className="text-[#F87171] sm:mr-auto"
              icon={<Trash2 className="h-4 w-4" />}
              loading={del.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Excluir dívida?', message: `${debt.name} e todas as suas parcelas serão excluídas.`, confirmLabel: 'Excluir' })) del.mutate(undefined);
              }}
            >
              Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      {d && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-line bg-field p-3 sm:grid-cols-4">
          <Info label="Situação" value={<Pill tone={DEBT_STATUS[d.status].tone}>{DEBT_STATUS[d.status].label}</Pill>} />
          <Info label="Pago" value={`${brl$(d.paidAmount)} (${d.paidCount}/${d.installments})`} />
          <Info label="Falta pagar" value={brl$(d.remainingAmount)} danger={d.status === 'ATRASADA'} />
          <Info label="Próxima parcela" value={d.nextDueDate ? `${dateBR(d.nextDueDate)}` : '—'} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dívida" htmlFor="d-name">
          <Input id="d-name" icon={<CreditCard />} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Empréstimo, cartão, financiamento" />
        </Field>
        <Field label="Credor" htmlFor="d-cred">
          <Input id="d-cred" icon={<Landmark />} value={f.creditor} onChange={(e) => setF({ ...f, creditor: e.target.value })} placeholder="Ex.: Banco, loja, pessoa" />
        </Field>
        <Field label="Valor total da dívida">
          <MoneyInput id="d-total" value={f.total} onChange={(v) => setF({ ...f, total: v })} />
        </Field>
        <Field label="Nº de parcelas" htmlFor="d-inst">
          <Input id="d-inst" type="number" inputMode="numeric" min={1} max={420} value={f.installments} onChange={(e) => setF({ ...f, installments: Math.max(1, Math.min(420, Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="Dia do vencimento" htmlFor="d-day" hint="Em meses mais curtos, vence no último dia">
          <Select id="d-day" value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Todo dia {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mês da 1ª parcela" htmlFor="d-start">
          <Select id="d-start" value={f.startMonth} onChange={(e) => setF({ ...f, startMonth: e.target.value })}>
            {monthOptions(today, f.startMonth).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
              </option>
            ))}
          </Select>
        </Field>
        {!debt && (
          <Field label="Parcelas já pagas" htmlFor="d-paid" hint="Para dívidas que já estão em andamento">
            <Input id="d-paid" type="number" inputMode="numeric" min={0} max={f.installments} value={f.paidCount} onChange={(e) => setF({ ...f, paidCount: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
        )}
        <p className="label flex items-center sm:col-span-2">
          {f.installments}x de {brlC(parcel)} · {monthLabel(f.startMonth, true)} a {monthLabel(lastMonth, true)} · total {brlC(totalCents)}
        </p>
        {debt && <p className="-mt-2 text-[11.5px] italic text-ink-faint sm:col-span-2">Mudando valor, parcelas, dia ou início: as parcelas pagas ficam como estão e o restante é dividido entre as em aberto.</p>}
        <Field label="Observações" htmlFor="d-notes" className="sm:col-span-2">
          <Textarea id="d-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>

      {d && d.installmentsList.length > 0 && (
        <div className="mt-4 rounded-card border border-line bg-field p-3">
          <p className="label mb-2">Parcelas</p>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto" aria-label="Parcelas da dívida">
            {d.installmentsList.map((x) => {
              const late = x.status !== 'PAGA' && x.dueDate < today;
              return (
                <li key={x.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-14 shrink-0 text-[12.5px] text-ink-muted">
                    {x.number}/{x.count}
                  </span>
                  <span className={clsx('flex-1 text-[13px]', late ? 'text-[#F87171]' : 'text-ink-body')}>{dateBR(x.dueDate)}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-white">{brl$(x.amount)}</span>
                  <Pill tone={x.status === 'PAGA' ? 'success' : late ? 'danger' : 'info'}>{x.status === 'PAGA' ? 'Paga' : late ? 'Atrasada' : 'A vencer'}</Pill>
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
              );
            })}
          </ul>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-3 rounded-field border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-[#FCA5A5]">
          {err}
        </p>
      )}
    </Modal>
  );
}

function Info({ label, value, danger }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="label truncate">{label}</p>
      <div className={clsx('truncate text-[13.5px] font-semibold', danger ? 'text-[#F87171]' : 'text-white')}>{value}</div>
    </div>
  );
}
