import { CheckCircle2, FileText, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { installmentPlan } from '../../../../server/src/core/calc';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Segmented } from '../../components/ui/primitives';
import { api, ApiError } from '../../lib/api';
import { addDays, todayLocal } from '../../lib/dates';
import { brlC, dateBR, pct } from '../../lib/format';
import { METHOD_LABEL } from '../../lib/labels';
import { useFinMutation, useSettings } from '../../lib/queries';
import type { Opportunity, PaymentMethod, SaleDetail } from '../../lib/types';

const firstDateLabel: Record<PaymentMethod, string> = {
  PIX: 'Data do pagamento (1ª parcela)',
  BOLETO: 'Vencimento do 1º boleto',
  CARTAO: 'Data de disponibilidade do recurso (1ª parcela)',
};

function defaultFirstDate(method: PaymentMethod, saleDate: string) {
  return method === 'PIX' ? saleDate : addDays(saleDate, 30);
}

export type SaleDialogMode = { kind: 'convert'; opportunity: Opportunity } | { kind: 'new' } | { kind: 'edit'; sale: SaleDetail };

/**
 * Venda efetuada: forma de pagamento e programação dos recebimentos.
 * Pix/Boleto: sem desconto, em X parcelas mensais. Cartão: desconta a taxa (19%) e usa a data de disponibilidade.
 * A prévia usa a MESMA função de cálculo do servidor (installmentPlan).
 */
export function SaleDialog({ mode, onClose }: { mode: SaleDialogMode | null; onClose: () => void }) {
  const settings = useSettings();
  const confirm = useConfirm();
  const rate = settings.data?.cardFeeRate ?? 0.19;
  const today = settings.data?.today ?? todayLocal();
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [gross, setGross] = useState<number | null>(null);
  const [saleDate, setSaleDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [installments, setInstallments] = useState(1);
  const [firstDate, setFirstDate] = useState(today);
  const [firstTouched, setFirstTouched] = useState(false);
  const [dates, setDates] = useState<(string | null)[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setError(null);
    setDates([]);
    setFirstTouched(false);
    if (mode.kind === 'edit') {
      const s = mode.sale;
      setClient(s.client);
      setDescription(s.description ?? '');
      setGross(Number(s.grossAmount));
      setSaleDate(s.saleDate);
      setMethod(s.paymentMethod);
      setInstallments(s.installments);
      setFirstDate(s.receivables[0]?.dueDate ?? s.saleDate);
      setDates(s.receivables.map((r) => r.dueDate));
      setFirstTouched(true);
      setNotes(s.notes ?? '');
    } else {
      const o = mode.kind === 'convert' ? mode.opportunity : null;
      setClient(o?.client ?? '');
      setDescription(o?.description ?? '');
      setGross(o ? Number(o.grossAmount) : null);
      setSaleDate(today);
      setMethod('PIX');
      setInstallments(1);
      setFirstDate(today);
      setNotes('');
    }
  }, [mode, today]);

  const changeMethod = (m: PaymentMethod) => {
    setMethod(m);
    if (!firstTouched) setFirstDate(defaultFirstDate(m, saleDate));
    setDates([]);
  };

  const plan = useMemo(() => {
    if (!gross || gross <= 0 || !firstDate) return [];
    return installmentPlan({ gross: Math.round(gross * 100), method, cardRate: rate, count: installments, firstDate, dates });
  }, [gross, method, rate, installments, firstDate, dates]);
  const totals = plan.reduce((a, p) => ({ fee: a.fee + p.fee, net: a.net + p.net }), { fee: 0, net: 0 });

  const save = useFinMutation(
    (force: boolean) => {
      const body = { client, description, grossAmount: gross ?? 0, saleDate, paymentMethod: method, installments, firstDate, dates: plan.map((p) => p.dueDate), notes, force };
      if (mode?.kind === 'convert') return api.post(`/api/opportunities/${mode.opportunity.id}/convert`, body);
      if (mode?.kind === 'edit') return api.put(`/api/sales/${mode.sale.id}`, body);
      return api.post('/api/sales', body);
    },
    { success: mode?.kind === 'edit' ? 'Venda atualizada' : 'Venda efetuada! Recebimentos programados no Faturamento', onSuccess: onClose },
  );

  const submit = async () => {
    if (!client.trim()) return setError('Informe o cliente');
    if (!gross || gross <= 0) return setError('Informe o valor da venda');
    if (!firstDate) return setError('Informe a data do primeiro recebimento');
    setError(null);
    try {
      await save.mutateAsync(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'POSSIBLE_DUPLICATE' && (await confirm({ title: 'Possível duplicidade', message: err.message, confirmLabel: 'Salvar mesmo assim', tone: 'primary' })))
        await save.mutateAsync(true).catch(() => undefined);
      else if (err instanceof ApiError) setError(err.message);
    }
  };

  if (!mode) return null;
  const title = mode.kind === 'convert' ? 'Venda efetuada' : mode.kind === 'edit' ? 'Consultar / editar venda' : 'Nova venda efetuada';
  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      size="lg"
      title={title}
      subtitle="O valor bruto entra nas vendas do mês (meta). As parcelas entram no Faturamento."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={mode.kind === 'edit' ? 'primary' : 'success'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={submit} loading={save.isPending}>
            {mode.kind === 'edit' ? 'Salvar alterações' : 'Confirmar venda'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" htmlFor="v-client" className="sm:col-span-2">
          <Input id="v-client" icon={<User />} value={client} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field label="Valor bruto da venda">
          <MoneyInput id="v-gross" value={gross} onChange={(v) => { setGross(v); setDates([]); }} />
        </Field>
        <Field label="Data da venda" htmlFor="v-date" hint="Define o mês da venda (meta)">
          <Input
            id="v-date"
            type="date"
            value={saleDate}
            onChange={(e) => {
              setSaleDate(e.target.value);
              if (!firstTouched && e.target.value) setFirstDate(defaultFirstDate(method, e.target.value));
            }}
          />
        </Field>
        <Field label="Como será pago" className="sm:col-span-2">
          <Segmented<PaymentMethod> className="w-full [&>button]:flex-1" value={method} onChange={changeMethod} options={(['PIX', 'BOLETO', 'CARTAO'] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          <p className="label mt-1">{method === 'CARTAO' ? `Cartão: desconta ${pct(rate, 0)} do valor; o líquido entra no faturamento na data de disponibilidade.` : `${METHOD_LABEL[method]}: sem desconto, valor integral programado nas datas abaixo.`}</p>
        </Field>
        <Field label="Parcelas" htmlFor="v-inst">
          <Select id="v-inst" value={installments} onChange={(e) => { setInstallments(Number(e.target.value)); setDates([]); }}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'À vista (1x)' : `${n}x mensais`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={firstDateLabel[method]} htmlFor="v-first">
          <Input id="v-first" type="date" value={firstDate} onChange={(e) => { setFirstDate(e.target.value); setFirstTouched(true); setDates([]); }} />
        </Field>
        <Field label="Descrição" htmlFor="v-desc" className="sm:col-span-2">
          <Input id="v-desc" icon={<FileText />} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 rounded-card border border-line bg-field p-3">
        <div className="mb-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="label">Venda (bruto)</p>
            <p className="kpi-value text-[15px]">{brlC(Math.round((gross ?? 0) * 100))}</p>
          </div>
          <div>
            <p className="label">Desconto cartão</p>
            <p className="kpi-value text-[15px] text-[#F87171]">{totals.fee ? `−${brlC(totals.fee)}` : 'R$ 0,00'}</p>
          </div>
          <div>
            <p className="label">Entra no faturamento</p>
            <p className="kpi-value text-[15px] text-[#34D399]">{brlC(totals.net)}</p>
          </div>
        </div>
        {plan.length > 0 && (
          <ul className="divide-y divide-line border-t border-line" aria-label="Programação dos recebimentos">
            {plan.map((p, i) => (
              <li key={p.number} className="flex items-center justify-between gap-3 py-2">
                <span className="w-14 shrink-0 text-[12.5px] text-ink-muted">{p.number}/{plan.length}</span>
                <input
                  type="date"
                  aria-label={`Data da parcela ${p.number}`}
                  value={p.dueDate}
                  onChange={(e) => {
                    const next = plan.map((x) => x.dueDate);
                    next[i] = e.target.value;
                    setDates(next);
                  }}
                  className="h-10 flex-1 rounded-lg border border-line bg-bg px-2 text-[13px] text-ink-body focus:border-accent focus:outline-none"
                />
                <span className="w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums text-white">{brlC(p.net)}</span>
              </li>
            ))}
          </ul>
        )}
        {plan.length > 0 && <p className="mt-1 text-[11.5px] italic text-ink-faint">Primeira em {dateBR(plan[0].dueDate)} · você pode ajustar a data de cada parcela.</p>}
      </div>

      <Field label="Observações" htmlFor="v-notes" className="mt-4">
        <Textarea id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="mt-3 rounded-field border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-[#FCA5A5]">
          {error}
        </p>
      )}
    </Modal>
  );
}
