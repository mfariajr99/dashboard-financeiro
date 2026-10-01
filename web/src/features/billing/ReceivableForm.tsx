import { CheckCircle2, Repeat, RotateCcw, Trash2, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { monthsInclusive, recurrenceFromDates } from '../../../../server/src/core/calc';
import { Field, Input, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Pill, Segmented } from '../../components/ui/primitives';
import { defaultRecurrence, RecurrenceFields, type Recurrence } from '../../components/ui/RecurrenceFields';
import { api, ApiError } from '../../lib/api';
import { todayLocal } from '../../lib/dates';
import { brl$, dateBR, monthLabel, pct } from '../../lib/format';
import { METHOD_LABEL, REC_SITUATION } from '../../lib/labels';
import { useFinMutation, useReceivable, useSettings } from '../../lib/queries';
import type { PaymentMethod, ReceivableRow } from '../../lib/types';

type Kind = 'UNICA' | 'RECORRENTE';
type Scope = 'one' | 'series';

/**
 * Receita programada: cadastro avulso (única ou recorrente mensal), consulta e edição.
 * Parcelas de venda: só data e observação. Recorrente: editar só esta ou toda a recorrência.
 */
export function ReceivableForm({ open, onClose, receivable }: { open: boolean; onClose: () => void; receivable?: ReceivableRow | null }) {
  const settings = useSettings();
  const today = settings.data?.today ?? todayLocal();
  const rate = settings.data?.cardFeeRate ?? 0.19;
  const detail = useReceivable(open && receivable?.seriesId ? receivable.id : null);
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [gross, setGross] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState<Kind>('UNICA');
  const [scope, setScope] = useState<Scope>('one');
  const [rec, setRec] = useState<Recurrence>(defaultRecurrence(today));
  const [err, setErr] = useState<string | null>(null);

  const inSeries = !!receivable?.seriesId;
  const seriesRec = useMemo(() => (detail.data?.series.length ? recurrenceFromDates(detail.data.series.map((x) => x.dueDate)) : null), [detail.data]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setClient(receivable?.client ?? '');
    setDescription(receivable?.description ?? '');
    setMethod(receivable?.paymentMethod ?? 'PIX');
    setGross(receivable ? Number(receivable.grossAmount) : null);
    setDueDate(receivable?.dueDate ?? today);
    setNotes(receivable?.notes ?? '');
    setKind(receivable?.seriesId ? 'RECORRENTE' : 'UNICA');
    setScope('one');
    setRec(defaultRecurrence(receivable?.dueDate ?? today));
  }, [open, receivable, today]);
  useEffect(() => {
    if (seriesRec) setRec(seriesRec);
  }, [seriesRec]);

  const confirm = useConfirm();
  const fromSale = !!receivable?.saleId;
  // Editando toda a recorrência, ou criando/convertendo em recorrente
  const recurringEdit = !fromSale && (receivable ? (inSeries ? scope === 'series' : kind === 'RECORRENTE') : kind === 'RECORRENTE');
  const count = recurringEdit ? monthsInclusive(rec.startMonth, rec.endMonth) : 1;
  const unitCents = Math.round((gross ?? 0) * 100);

  const del = useFinMutation((series: boolean) => api.del<{ removed: number }>(`/api/receivables/${receivable!.id}${series ? '?series=true' : ''}`), {
    success: (r) => ((r as { removed?: number })?.removed ?? 1) > 1 ? `${(r as { removed: number }).removed} receitas excluídas` : 'Receita excluída',
    onSuccess: onClose,
  });
  const save = useFinMutation(
    () => {
      const base = { client, description, paymentMethod: method, grossAmount: gross ?? 0, notes };
      const recurrence = recurringEdit ? rec : null;
      const first = recurringEdit ? `${rec.startMonth}-01` : dueDate;
      if (!receivable) return api.post<{ seriesCount?: number; saleGrossAmount?: string }>('/api/receivables', { ...base, dueDate: first, recurrence });
      if (fromSale) return api.put<{ seriesCount?: number; saleGrossAmount?: string }>('/api/receivables/' + receivable.id, { dueDate, notes, grossAmount: gross ?? 0 });
      return api.put<{ seriesCount?: number; saleGrossAmount?: string }>(`/api/receivables/${receivable.id}`, { ...base, dueDate: recurringEdit ? receivable.dueDate : dueDate, recurrence, scope: recurringEdit ? 'series' : 'one' });
    },
    {
      success: (r) => {
        const saleTotal = (r as { saleGrossAmount?: string })?.saleGrossAmount;
        if (saleTotal) return `Parcela atualizada · total da venda agora ${brl$(saleTotal)}`;
        const n = (r as { seriesCount?: number })?.seriesCount ?? 1;
        if (n > 1) return receivable ? `Recorrência atualizada: ${n} receitas programadas` : `${n} receitas mensais programadas no Faturamento`;
        return receivable ? 'Receita atualizada' : 'Receita programada';
      },
      onSuccess: onClose,
    },
  );
  const receive = useFinMutation(() => api.patch(`/api/receivables/${receivable!.id}/receive`, {}), { success: 'Marcada como recebida', onSuccess: onClose });
  const undo = useFinMutation(() => api.patch(`/api/receivables/${receivable!.id}/unreceive`, {}), { success: 'Recebimento desfeito', onSuccess: onClose });

  const submit = async () => {
    if (!fromSale && !client.trim()) return setErr('Informe o cliente / origem');
    if (!gross || gross <= 0) return setErr('Informe o valor');
    if (recurringEdit && count < 1) return setErr('O mês de fim deve ser igual ou depois do mês de início');
    if (recurringEdit && count > 60) return setErr('A recorrência pode ter no máximo 60 meses');
    if (!recurringEdit && !dueDate) return setErr('Informe a data');
    setErr(null);
    try {
      await save.mutateAsync(undefined);
    } catch (e) {
      if (e instanceof ApiError) setErr(e.message);
    }
  };

  const remove = async () => {
    if (!receivable) return;
    if (inSeries && (await confirm({ title: 'Excluir também as próximas?', message: 'Esta receita é recorrente. Confirme para excluir esta e as próximas ainda não recebidas, ou cancele para escolher só esta.', confirmLabel: 'Esta e as próximas' })))
      return del.mutate(true);
    if (await confirm({ title: 'Excluir receita?', message: `${receivable.client} — ${dateBR(receivable.dueDate)}`, confirmLabel: 'Excluir' })) del.mutate(false);
  };

  const net = (gross ?? 0) * (method === 'CARTAO' ? 1 - rate : 1);
  // taxa histórica da parcela de venda (cartão)
  const saleRate = receivable && Number(receivable.grossAmount) > 0 ? Number(receivable.feeAmount) / Number(receivable.grossAmount) : rate;
  const dateLabel = method === 'CARTAO' ? 'Data de disponibilidade' : 'Data do pagamento';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={receivable ? 'Consultar / editar receita' : 'Nova receita'}
      subtitle="Faturamento programado para recebimento"
      footer={
        <>
          {receivable && !fromSale && (
            <Button variant="ghost" className="text-[#F87171] sm:mr-auto" icon={<Trash2 className="h-4 w-4" />} loading={del.isPending} onClick={remove}>
              Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {receivable &&
            (receivable.status === 'RECEBIDO' ? (
              <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => undo.mutate(undefined)} loading={undo.isPending}>
                Desfazer recebimento
              </Button>
            ) : (
              <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => receive.mutate(undefined)} loading={receive.isPending}>
                Marcar recebida
              </Button>
            ))}
          <Button onClick={submit} loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      {receivable && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-field px-3 py-2 text-[12.5px] text-ink-soft">
          <Pill tone={REC_SITUATION[receivable.situation].tone}>{REC_SITUATION[receivable.situation].label}</Pill>
          {fromSale && <span>Parcela {receivable.installmentNumber}/{receivable.installmentCount} de venda efetuada</span>}
          {inSeries && (
            <span className="flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" /> Recorrente {receivable.installmentNumber}/{receivable.installmentCount}
              {seriesRec && ` · ${monthLabel(seriesRec.startMonth, true)} a ${monthLabel(seriesRec.endMonth, true)}`}
            </span>
          )}
          {receivable.receivedDate && <span>· recebida em {dateBR(receivable.receivedDate)}</span>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {inSeries && !fromSale && (
          <Field label="O que alterar" className="sm:col-span-2">
            <Segmented<Scope>
              className="w-full [&>button]:flex-1"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'one', label: 'Só esta receita' },
                { value: 'series', label: 'Toda a recorrência' },
              ]}
            />
          </Field>
        )}
        <Field label="Cliente / origem" htmlFor="r-client" className="sm:col-span-2">
          <Input id="r-client" icon={<User />} value={client} disabled={fromSale} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field label="Tipo" className="sm:col-span-2">
          {fromSale ? (
            <p className="text-[13.5px]">{METHOD_LABEL[method]}</p>
          ) : (
            <Segmented<PaymentMethod> className="w-full [&>button]:flex-1" value={method} onChange={setMethod} options={(['PIX', 'BOLETO', 'CARTAO'] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          )}
        </Field>
        {!fromSale && !inSeries && (
          <Field label="Programação" className="sm:col-span-2">
            <Segmented<Kind>
              className="w-full [&>button]:flex-1"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'UNICA', label: 'Receita única' },
                { value: 'RECORRENTE', label: 'Recorrente (mensal)' },
              ]}
            />
          </Field>
        )}
        <Field
          label={recurringEdit ? 'Valor de cada receita (mensal)' : fromSale ? 'Valor da parcela (bruto)' : 'Valor (bruto)'}
          hint={
            fromSale
              ? `${method === 'CARTAO' ? `Líquido após ${pct(saleRate)}: ${brl$((gross ?? 0) * (1 - saleRate))} · ` : ''}Alterar ajusta o total da venda`
              : method === 'CARTAO'
                ? `Líquido após ${pct(rate)}: ${brl$(net)}`
                : 'Sem desconto'
          }
        >
          <MoneyInput id="r-gross" value={gross} onChange={setGross} />
        </Field>
        {recurringEdit ? (
          <RecurrenceFields idPrefix="r" today={today} value={rec} onChange={setRec} unitCents={unitCents} unitLabel="receita" />
        ) : (
          <Field label={dateLabel} htmlFor="r-date">
            <Input id="r-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        )}
        {recurringEdit && receivable && (
          <p className="text-[11.5px] italic text-ink-faint sm:col-span-2">As receitas já recebidas são mantidas; as demais são reprogramadas com o novo valor e as novas datas.</p>
        )}
        {!fromSale && (
          <Field label="Descrição" htmlFor="r-desc" className="sm:col-span-2">
            <Input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        )}
        <Field label="Observações" htmlFor="r-notes" className="sm:col-span-2">
          <Textarea id="r-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {err && <p role="alert" className="mt-3 rounded-field border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-[#FCA5A5]">{err}</p>}
    </Modal>
  );
}
