import { CheckCircle2, FileText, Repeat, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { installmentPlan, monthsInclusive, recurrenceFromDates, recurringDates } from '../../../../server/src/core/calc';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Segmented } from '../../components/ui/primitives';
import { api, ApiError } from '../../lib/api';
import { addDays, addMonths, monthOf, todayLocal } from '../../lib/dates';
import { brlC, dateBR, monthLabel, pct } from '../../lib/format';
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

type BoletoMode = 'UNICA' | 'RECORRENTE';

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
  // Boleto: cobrança única (1 data) ou recorrente (dia do vencimento, mês de início e de fim)
  const [boletoMode, setBoletoMode] = useState<BoletoMode>('UNICA');
  const [recDay, setRecDay] = useState(10);
  const [recStart, setRecStart] = useState(monthOf(today));
  const [recEnd, setRecEnd] = useState(addMonths(monthOf(today), 11));
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
      const rec = s.paymentMethod === 'BOLETO' && s.installments > 1 ? recurrenceFromDates(s.receivables.map((r) => r.dueDate)) : null;
      setBoletoMode(rec ? 'RECORRENTE' : 'UNICA');
      if (rec) {
        // na recorrente o valor digitado é o de cada boleto (mensal)
        setGross(Math.round((Number(s.grossAmount) * 100) / s.installments) / 100);
        setRecDay(rec.day);
        setRecStart(rec.startMonth);
        setRecEnd(rec.endMonth);
      }
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
      setBoletoMode('UNICA');
    }
  }, [mode, today]);

  const changeMethod = (m: PaymentMethod) => {
    setMethod(m);
    if (!firstTouched) setFirstDate(defaultFirstDate(m, saleDate));
    setDates([]);
    if (m === 'BOLETO' && boletoMode === 'UNICA') setInstallments(1);
  };

  const changeBoletoMode = (bm: BoletoMode) => {
    setBoletoMode(bm);
    setDates([]);
    if (bm === 'UNICA') setInstallments(1);
    else {
      // sugestão: mesmo dia do 1º vencimento, começando no mês dele, por 12 meses
      setRecDay(Number(firstDate.slice(8, 10)) || 10);
      setRecStart(monthOf(firstDate));
      setRecEnd(addMonths(monthOf(firstDate), 11));
    }
  };

  const recurring = method === 'BOLETO' && boletoMode === 'RECORRENTE';
  const recCount = recurring ? monthsInclusive(recStart, recEnd) : 0;
  const recDates = useMemo(() => (recurring ? recurringDates(recDay, recStart, recEnd) : []), [recurring, recDay, recStart, recEnd]);
  const unitCents = Math.round((gross ?? 0) * 100);
  const grossCents = recurring ? unitCents * recDates.length : unitCents; // venda total (entra na meta)
  const count = recurring ? recDates.length : method === 'BOLETO' ? 1 : installments;

  const plan = useMemo(() => {
    if (!gross || gross <= 0) return [];
    if (recurring) return recDates.length ? installmentPlan({ gross: grossCents, method, cardRate: rate, count: recDates.length, firstDate: recDates[0], dates: recDates }) : [];
    if (!firstDate) return [];
    return installmentPlan({ gross: grossCents, method, cardRate: rate, count, firstDate, dates });
  }, [gross, recurring, recDates, grossCents, method, rate, count, firstDate, dates]);
  const totals = plan.reduce((a, p) => ({ fee: a.fee + p.fee, net: a.net + p.net }), { fee: 0, net: 0 });

  const save = useFinMutation(
    (force: boolean) => {
      const body = { client, description, grossAmount: grossCents / 100, saleDate, paymentMethod: method, installments: plan.length, firstDate: plan[0]?.dueDate ?? firstDate, dates: plan.map((p) => p.dueDate), notes, force };
      if (mode?.kind === 'convert') return api.post(`/api/opportunities/${mode.opportunity.id}/convert`, body);
      if (mode?.kind === 'edit') return api.put(`/api/sales/${mode.sale.id}`, body);
      return api.post('/api/sales', body);
    },
    { success: mode?.kind === 'edit' ? 'Venda atualizada' : 'Venda efetuada! Recebimentos programados no Faturamento', onSuccess: onClose },
  );

  const submit = async () => {
    if (!client.trim()) return setError('Informe o cliente');
    if (!gross || gross <= 0) return setError('Informe o valor da venda');
    if (recurring && recCount < 1) return setError('O mês de fim deve ser igual ou depois do mês de início');
    if (recurring && recCount > 60) return setError('A cobrança recorrente pode ter no máximo 60 meses');
    if (!recurring && !firstDate) return setError('Informe a data do primeiro recebimento');
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
        <Field label={recurring ? 'Valor de cada boleto (mensal)' : 'Valor bruto da venda'}>
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
        {method === 'BOLETO' && (
          <Field label="Tipo de cobrança" className="sm:col-span-2">
            <Segmented<BoletoMode>
              className="w-full [&>button]:flex-1"
              value={boletoMode}
              onChange={changeBoletoMode}
              options={[
                { value: 'UNICA', label: 'Cobrança única' },
                { value: 'RECORRENTE', label: 'Recorrente (mensal)' },
              ]}
            />
          </Field>
        )}
        {recurring ? (
          <>
            <Field label="Dia do vencimento" htmlFor="v-rday" hint="Em meses mais curtos, vence no último dia">
              <Select id="v-rday" value={recDay} onChange={(e) => setRecDay(Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Todo dia {d}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mês de início" htmlFor="v-rstart">
                <Select id="v-rstart" value={recStart} onChange={(e) => { setRecStart(e.target.value); if (e.target.value > recEnd) setRecEnd(e.target.value); }}>
                  {monthOptions(today, recStart).map((m) => (
                    <option key={m} value={m}>{monthLabel(m, true)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Mês de fim" htmlFor="v-rend">
                <Select id="v-rend" value={recEnd} onChange={(e) => setRecEnd(e.target.value)}>
                  {monthOptions(today, recEnd).filter((m) => m >= recStart).map((m) => (
                    <option key={m} value={m}>{monthLabel(m, true)}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="label -mt-2 flex items-center gap-1.5 sm:col-span-2">
              <Repeat className="h-3.5 w-3.5" />
              {recCount} cobrança(s) mensal(is) de {brlC(unitCents)} · venda total {brlC(grossCents)}
            </p>
          </>
        ) : (
          <>
            {method !== 'BOLETO' && (
              <Field label="Parcelas" htmlFor="v-inst">
                <Select id="v-inst" value={installments} onChange={(e) => { setInstallments(Number(e.target.value)); setDates([]); }}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'À vista (1x)' : `${n}x mensais`}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={method === 'BOLETO' ? 'Data de vencimento' : firstDateLabel[method]} htmlFor="v-first">
              <Input id="v-first" type="date" value={firstDate} onChange={(e) => { setFirstDate(e.target.value); setFirstTouched(true); setDates([]); }} />
            </Field>
          </>
        )}
        <Field label="Descrição" htmlFor="v-desc" className="sm:col-span-2">
          <Input id="v-desc" icon={<FileText />} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 rounded-card border border-line bg-field p-3">
        <div className="mb-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="label">{recurring ? 'Venda total (bruto)' : 'Venda (bruto)'}</p>
            <p className="kpi-value text-[15px]">{brlC(grossCents)}</p>
          </div>
          <div>
            <p className="label">Desconto cartão</p>
            <p className={`kpi-value text-[15px] ${totals.fee ? 'text-[#F87171]' : 'text-ink-muted'}`}>{totals.fee ? `−${brlC(totals.fee)}` : 'R$ 0,00'}</p>
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
                {recurring ? (
                  <span className="flex-1 text-[13px] text-ink-body">{dateBR(p.dueDate)} · {monthLabel(p.dueDate.slice(0, 7), true)}</span>
                ) : (
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
                )}
                <span className="w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums text-white">{brlC(p.net)}</span>
              </li>
            ))}
          </ul>
        )}
        {plan.length > 0 && (
          <p className="mt-1 text-[11.5px] italic text-ink-faint">
            {recurring ? `Boletos programados de ${monthLabel(recStart, true)} a ${monthLabel(recEnd, true)} — já entram no Faturamento de cada mês.` : `Primeira em ${dateBR(plan[0].dueDate)} · você pode ajustar a data de cada parcela.`}
          </p>
        )}
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

/** Meses para escolher início/fim: 12 meses atrás até 5 anos à frente (inclui o valor atual). */
function monthOptions(today: string, current: string): string[] {
  const base = addMonths(monthOf(today), -12);
  const list = Array.from({ length: 12 + 61 }, (_, i) => addMonths(base, i));
  if (!list.includes(current)) list.push(current);
  return list.sort();
}
