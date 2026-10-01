import { CheckCircle2, RotateCcw, Trash2, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, Input, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Pill, Segmented } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { todayLocal } from '../../lib/dates';
import { brl$, dateBR, pct } from '../../lib/format';
import { METHOD_LABEL, REC_SITUATION } from '../../lib/labels';
import { useFinMutation, useSettings } from '../../lib/queries';
import type { PaymentMethod, ReceivableRow } from '../../lib/types';

/** Receita programada: cadastro avulso, consulta e edição (parcelas de venda: data e observação). */
export function ReceivableForm({ open, onClose, receivable }: { open: boolean; onClose: () => void; receivable?: ReceivableRow | null }) {
  const settings = useSettings();
  const today = settings.data?.today ?? todayLocal();
  const rate = settings.data?.cardFeeRate ?? 0.19;
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [gross, setGross] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setClient(receivable?.client ?? '');
    setDescription(receivable?.description ?? '');
    setMethod(receivable?.paymentMethod ?? 'PIX');
    setGross(receivable ? Number(receivable.grossAmount) : null);
    setDueDate(receivable?.dueDate ?? today);
    setNotes(receivable?.notes ?? '');
  }, [open, receivable, today]);

  const confirm = useConfirm();
  const fromSale = !!receivable?.saleId;
  const del = useFinMutation(() => api.del(`/api/receivables/${receivable!.id}`), { success: 'Receita excluída', onSuccess: onClose });
  const save = useFinMutation(
    () =>
      receivable
        ? api.put(`/api/receivables/${receivable.id}`, fromSale ? { dueDate, notes } : { client, description, paymentMethod: method, grossAmount: gross ?? 0, dueDate, notes })
        : api.post('/api/receivables', { client, description, paymentMethod: method, grossAmount: gross ?? 0, dueDate, notes }),
    { success: receivable ? 'Receita atualizada' : 'Receita programada', onSuccess: onClose },
  );
  const receive = useFinMutation(() => api.patch(`/api/receivables/${receivable!.id}/receive`, {}), { success: 'Marcada como recebida', onSuccess: onClose });
  const undo = useFinMutation(() => api.patch(`/api/receivables/${receivable!.id}/unreceive`, {}), { success: 'Recebimento desfeito', onSuccess: onClose });

  const submit = () => {
    if (!fromSale && !client.trim()) return setErr('Informe o cliente / origem');
    if (!fromSale && (!gross || gross <= 0)) return setErr('Informe o valor');
    if (!dueDate) return setErr('Informe a data');
    setErr(null);
    save.mutate(undefined);
  };
  const net = (gross ?? 0) * (method === 'CARTAO' ? 1 - rate : 1);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={receivable ? 'Consultar / editar receita' : 'Nova receita'}
      subtitle="Faturamento programado para recebimento"
      footer={
        <>
          {receivable && !fromSale && (
            <Button
              variant="ghost"
              className="text-[#F87171] sm:mr-auto"
              icon={<Trash2 className="h-4 w-4" />}
              loading={del.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Excluir receita?', message: `${receivable.client} — ${dateBR(receivable.dueDate)}`, confirmLabel: 'Excluir' })) del.mutate(undefined);
              }}
            >
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
          {receivable.receivedDate && <span>· recebida em {dateBR(receivable.receivedDate)}</span>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Field label="Valor (bruto)" hint={method === 'CARTAO' ? `Líquido após ${pct(rate)}: ${brl$(fromSale ? receivable!.netAmount : net)}` : 'Sem desconto'}>
          {fromSale ? <p className="kpi-value text-[16px]">{brl$(receivable!.grossAmount)}</p> : <MoneyInput id="r-gross" value={gross} onChange={setGross} />}
        </Field>
        <Field label={method === 'CARTAO' ? 'Data de disponibilidade' : 'Data do pagamento'} htmlFor="r-date">
          <Input id="r-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
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
