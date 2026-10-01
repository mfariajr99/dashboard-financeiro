import { Building2, Receipt, Repeat, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { recurrenceFromDates } from '../../../../server/src/core/calc';
import { defaultRecurrence, RecurrenceFields, type Recurrence } from '../../components/ui/RecurrenceFields';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Pill, Segmented } from '../../components/ui/primitives';
import { api, ApiError } from '../../lib/api';
import { monthOf, todayLocal } from '../../lib/dates';
import { monthLabel } from '../../lib/format';
import { EXP_SITUATION, EXPENSE_CATEGORIES, PERSONAL_EXPENSE_CATEGORIES } from '../../lib/labels';
import { useExpense, useFinMutation, useSettings } from '../../lib/queries';
import type { ExpenseRow } from '../../lib/types';

type Kind = 'UNICA' | 'RECORRENTE';
type Scope = 'one' | 'forward';

/**
 * Cadastro, consulta e edição de despesa: única ou recorrente (dia do vencimento, mês de início e fim).
 * Na edição de recorrente: "só esta" ou "esta e as próximas" (replica valor e dados para frente).
 */
export function ExpenseForm({ open, onClose, expense, personal = false }: { open: boolean; onClose: () => void; expense?: ExpenseRow | null; personal?: boolean }) {
  const base = personal ? '/api/personal/expenses' : '/api/expenses';
  const categories = personal ? PERSONAL_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES;
  const settings = useSettings();
  const confirm = useConfirm();
  const today = settings.data?.today ?? todayLocal();
  const [f, setF] = useState({ name: '', category: '', supplier: '', amount: null as number | null, dueDate: today, paid: false, paidDate: '', repeatMonths: 1, notes: '' });
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('UNICA');
  const [scope, setScope] = useState<Scope>('one');
  const [rec, setRec] = useState<Recurrence>(defaultRecurrence(today));
  const inSeries = !!expense?.seriesId;
  const detail = useExpense(open && inSeries ? expense!.id : null, base);
  const seriesRec = useMemo(() => (detail.data?.series.length ? recurrenceFromDates(detail.data.series.map((x) => x.dueDate)) : null), [detail.data]);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setKind('UNICA');
    setScope('one');
    setRec(defaultRecurrence(expense?.dueDate ?? today));
    setF(
      expense
        ? { name: expense.name, category: expense.category ?? '', supplier: expense.supplier ?? '', amount: Number(expense.amount), dueDate: expense.dueDate, paid: expense.status === 'PAGA', paidDate: expense.paidDate ?? '', repeatMonths: 1, notes: expense.notes ?? '' }
        : { name: '', category: '', supplier: '', amount: null, dueDate: today, paid: false, paidDate: '', repeatMonths: 1, notes: '' },
    );
  }, [open, expense, today]);
  useEffect(() => {
    if (seriesRec && expense) setRec({ day: Number(expense.dueDate.slice(8, 10)) || seriesRec.day, startMonth: monthOf(expense.dueDate), endMonth: seriesRec.endMonth });
  }, [seriesRec, expense]);

  // criar recorrente, transformar uma única em recorrente ou editar "esta e as próximas"
  const recurring = expense ? (inSeries ? scope === 'forward' : kind === 'RECORRENTE') : kind === 'RECORRENTE';
  const recValue: Recurrence = expense && recurring ? { ...rec, startMonth: monthOf(expense.dueDate) } : rec;

  const save = useFinMutation(
    (force: boolean) => {
      const { repeatMonths: _rm, ...rest } = f;
      void _rm;
      const body = {
        ...rest,
        amount: f.amount ?? 0,
        paidDate: f.paid ? f.paidDate || today : null,
        force,
        dueDate: recurring && !expense ? `${rec.startMonth}-${String(Math.min(rec.day, 28)).padStart(2, '0')}` : f.dueDate,
        recurrence: recurring ? recValue : null,
        scope: expense && recurring ? 'forward' : 'one',
      };
      return expense
        ? api.put<{ seriesCount?: number; forwardCount?: number }>(`${base}/${expense.id}`, body)
        : api.post<{ seriesCount?: number; forwardCount?: number }>(base, body);
    },
    {
      success: (r) => {
        const x = r as { seriesCount?: number; forwardCount?: number };
        if (expense) return x.forwardCount ? `Despesa atualizada nesta e nas próximas (${x.forwardCount} mês(es))` : 'Despesa atualizada';
        return (x.seriesCount ?? 1) > 1 ? `Despesa programada por ${x.seriesCount} meses` : 'Despesa cadastrada';
      },
      onSuccess: onClose,
    },
  );
  const del = useFinMutation((series: boolean) => api.del(`${base}/${expense!.id}${series ? '?series=true' : ''}`), { success: 'Despesa excluída', onSuccess: onClose });
  const remove = async () => {
    if (!expense) return;
    if (expense.seriesId && (await confirm({ title: 'Excluir também as próximas?', message: 'Esta despesa se repete. Confirme para excluir esta e as próximas não pagas, ou cancele para escolher só esta.', confirmLabel: 'Esta e as próximas' })))
      return del.mutate(true);
    if (await confirm({ title: 'Excluir despesa?', message: `${expense.name} — vencimento ${expense.dueDate.split('-').reverse().join('/')}`, confirmLabel: 'Excluir' })) del.mutate(false);
  };
  const submit = async () => {
    if (!f.name.trim()) return setErr('Informe a despesa');
    if (!f.amount || f.amount <= 0) return setErr('Informe o valor');
    if (!recurring && !f.dueDate) return setErr('Informe o vencimento');
    if (recurring && recValue.endMonth < recValue.startMonth) return setErr('O mês de fim deve ser igual ou depois do mês de início');
    setErr(null);
    try {
      await save.mutateAsync(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'POSSIBLE_DUPLICATE' && (await confirm({ title: 'Possível duplicidade', message: e.message, confirmLabel: 'Salvar mesmo assim', tone: 'primary' })))
        await save.mutateAsync(true).catch(() => undefined);
      else if (e instanceof ApiError) setErr(e.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Consultar / editar despesa' : 'Nova despesa'}
      subtitle={personal ? 'Conta pessoal · despesas e vencimentos' : 'Despesas e vencimentos'}
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
          {expense.seriesCount && (
            <span className="flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" /> Recorrente {expense.seriesIndex}/{expense.seriesCount}
              {seriesRec && ` · ${monthLabel(seriesRec.startMonth, true)} a ${monthLabel(seriesRec.endMonth, true)}`}
            </span>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {inSeries && (
          <Field label="O que alterar" className="sm:col-span-2">
            <Segmented<Scope>
              className="w-full [&>button]:flex-1"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'one', label: 'Só esta despesa' },
                { value: 'forward', label: 'Esta e as próximas' },
              ]}
            />
          </Field>
        )}
        <Field label="Despesa" htmlFor="e-name" className="sm:col-span-2">
          <Input id="e-name" icon={<Receipt />} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={personal ? 'Ex.: Pensão, aluguel, escola' : 'Ex.: Aluguel, folha, imposto'} />
        </Field>
        {!inSeries && (
          <Field label="Programação" className="sm:col-span-2">
            <Segmented<Kind>
              className="w-full [&>button]:flex-1"
              value={kind}
              onChange={(k) => {
                setKind(k);
                if (k === 'RECORRENTE' && !expense) setRec(defaultRecurrence(f.dueDate || today));
              }}
              options={[
                { value: 'UNICA', label: 'Despesa única' },
                { value: 'RECORRENTE', label: 'Recorrente (mensal)' },
              ]}
            />
          </Field>
        )}
        <Field label={recurring ? 'Valor de cada mês' : 'Valor'}>
          <MoneyInput id="e-amount" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </Field>
        {recurring ? (
          <RecurrenceFields idPrefix="e" today={today} value={recValue} onChange={setRec} unitCents={Math.round((f.amount ?? 0) * 100)} unitLabel="despesa" lockStart={!!expense} />
        ) : (
          <Field label="Vencimento" htmlFor="e-due">
            <Input id="e-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
        )}
        {recurring && expense && (
          <p className="text-[11.5px] italic text-ink-faint sm:col-span-2">
            Valor e dados serão aplicados de {monthLabel(monthOf(expense.dueDate), true)} em diante. Meses anteriores não mudam; despesas já pagas mantêm valor e data.
          </p>
        )}
        <Field label="Categoria" htmlFor="e-cat">
          <Select id="e-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={personal ? 'Favorecido' : 'Fornecedor'} htmlFor="e-sup">
          <Input id="e-sup" icon={<Building2 />} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label={recurring && !expense ? 'A primeira já está paga' : 'Já está paga'} checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked, paidDate: e.target.checked ? f.paidDate || today : '' })} />
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
