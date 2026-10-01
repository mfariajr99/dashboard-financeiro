import { Building2, Receipt, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Pill } from '../../components/ui/primitives';
import { api, ApiError } from '../../lib/api';
import { todayLocal } from '../../lib/dates';
import { EXP_SITUATION, EXPENSE_CATEGORIES } from '../../lib/labels';
import { useFinMutation, useSettings } from '../../lib/queries';
import type { ExpenseRow } from '../../lib/types';

/** Cadastro, consulta e edição de despesa (com opção de repetir mensalmente). */
export function ExpenseForm({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: ExpenseRow | null }) {
  const settings = useSettings();
  const confirm = useConfirm();
  const today = settings.data?.today ?? todayLocal();
  const [f, setF] = useState({ name: '', category: '', supplier: '', amount: null as number | null, dueDate: today, paid: false, paidDate: '', repeatMonths: 1, notes: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(
      expense
        ? { name: expense.name, category: expense.category ?? '', supplier: expense.supplier ?? '', amount: Number(expense.amount), dueDate: expense.dueDate, paid: expense.status === 'PAGA', paidDate: expense.paidDate ?? '', repeatMonths: 1, notes: expense.notes ?? '' }
        : { name: '', category: '', supplier: '', amount: null, dueDate: today, paid: false, paidDate: '', repeatMonths: 1, notes: '' },
    );
  }, [open, expense, today]);

  const save = useFinMutation(
    (force: boolean) => {
      const body = { ...f, amount: f.amount ?? 0, paidDate: f.paid ? f.paidDate || today : null, force };
      return expense ? api.put(`/api/expenses/${expense.id}`, body) : api.post('/api/expenses', body);
    },
    { success: expense ? 'Despesa atualizada' : f.repeatMonths > 1 ? `Despesa programada por ${f.repeatMonths} meses` : 'Despesa cadastrada', onSuccess: onClose },
  );
  const del = useFinMutation((series: boolean) => api.del(`/api/expenses/${expense!.id}${series ? '?series=true' : ''}`), { success: 'Despesa excluída', onSuccess: onClose });
  const remove = async () => {
    if (!expense) return;
    if (expense.seriesId && (await confirm({ title: 'Excluir também as próximas?', message: 'Esta despesa se repete. Confirme para excluir esta e as próximas não pagas, ou cancele para escolher só esta.', confirmLabel: 'Esta e as próximas' })))
      return del.mutate(true);
    if (await confirm({ title: 'Excluir despesa?', message: `${expense.name} — vencimento ${expense.dueDate.split('-').reverse().join('/')}`, confirmLabel: 'Excluir' })) del.mutate(false);
  };
  const submit = async () => {
    if (!f.name.trim()) return setErr('Informe a despesa');
    if (!f.amount || f.amount <= 0) return setErr('Informe o valor');
    if (!f.dueDate) return setErr('Informe o vencimento');
    setErr(null);
    try {
      await save.mutateAsync(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'POSSIBLE_DUPLICATE' && (await confirm({ title: 'Possível duplicidade', message: e.message, confirmLabel: 'Salvar mesmo assim', tone: 'primary' })))
        await save.mutateAsync(true).catch(() => undefined);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Consultar / editar despesa' : 'Nova despesa'}
      subtitle="Despesas e vencimentos"
      footer={
        <>
          {expense && (
            <Button variant="ghost" className="text-[#F87171] sm:mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={remove} loading={del.isPending}>
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
      {expense && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-field px-3 py-2 text-[12.5px] text-ink-soft">
          <Pill tone={EXP_SITUATION[expense.situation].tone}>{EXP_SITUATION[expense.situation].label}</Pill>
          {expense.seriesCount && <span>Repetição {expense.seriesIndex}/{expense.seriesCount}</span>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Despesa" htmlFor="e-name" className="sm:col-span-2">
          <Input id="e-name" icon={<Receipt />} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Aluguel, folha, imposto" />
        </Field>
        <Field label="Valor">
          <MoneyInput id="e-amount" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </Field>
        <Field label="Vencimento" htmlFor="e-due">
          <Input id="e-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        <Field label="Categoria" htmlFor="e-cat">
          <Select id="e-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Sem categoria</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fornecedor" htmlFor="e-sup">
          <Input id="e-sup" icon={<Building2 />} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
        </Field>
        {!expense && (
          <Field label="Repetir" htmlFor="e-rep" hint="Cria a mesma despesa nos próximos meses">
            <Select id="e-rep" value={f.repeatMonths} onChange={(e) => setF({ ...f, repeatMonths: Number(e.target.value) })}>
              <option value={1}>Não repetir</option>
              {[2, 3, 4, 6, 12, 24].map((n) => (
                <option key={n} value={n}>
                  Mensal por {n} meses
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Checkbox label="Já está paga" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked, paidDate: e.target.checked ? f.paidDate || today : '' })} />
        </div>
        {f.paid && (
          <Field label="Data do pagamento" htmlFor="e-paid">
            <Input id="e-paid" type="date" value={f.paidDate} onChange={(e) => setF({ ...f, paidDate: e.target.value })} />
          </Field>
        )}
        <Field label="Observações" htmlFor="e-notes" className="sm:col-span-2">
          <Textarea id="e-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      {err && <p role="alert" className="mt-3 rounded-field border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-[#FCA5A5]">{err}</p>}
    </Modal>
  );
}
