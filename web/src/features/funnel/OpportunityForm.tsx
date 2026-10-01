import { CalendarClock, FileText, User, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, Input, Textarea } from '../../components/ui/form';
import { Modal, useConfirm } from '../../components/ui/modal';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Pill } from '../../components/ui/primitives';
import { api, ApiError } from '../../lib/api';
import { brl$, dateBR, monthLabel } from '../../lib/format';
import { OPP_STATUS } from '../../lib/labels';
import { useMonth } from '../../lib/month';
import { useFinMutation } from '../../lib/queries';
import type { Opportunity } from '../../lib/types';

interface FormState {
  client: string;
  description: string;
  grossAmount: number | null;
  month: string;
  expectedDate: string;
  owner: string;
  notes: string;
}

/** Cadastro, consulta e edição de oportunidade do funil quente. */
export function OpportunityForm({ open, onClose, opportunity }: { open: boolean; onClose: () => void; opportunity?: Opportunity | null }) {
  const { month } = useMonth();
  const confirm = useConfirm();
  const [f, setF] = useState<FormState>({ client: '', description: '', grossAmount: null, month, expectedDate: '', owner: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      opportunity
        ? {
            client: opportunity.client,
            description: opportunity.description ?? '',
            grossAmount: Number(opportunity.grossAmount),
            month: opportunity.month,
            expectedDate: opportunity.expectedDate ?? '',
            owner: opportunity.owner ?? '',
            notes: opportunity.notes ?? '',
          }
        : { client: '', description: '', grossAmount: null, month, expectedDate: '', owner: '', notes: '' },
    );
  }, [open, opportunity, month]);

  const save = useFinMutation(
    (force: boolean) => {
      const body = { ...f, grossAmount: f.grossAmount ?? 0, force };
      return opportunity ? api.put(`/api/opportunities/${opportunity.id}`, body) : api.post('/api/opportunities', body);
    },
    { success: opportunity ? 'Oportunidade atualizada' : 'Oportunidade cadastrada no funil', onSuccess: onClose },
  );

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.client.trim()) e.client = 'Informe o cliente';
    if (!f.grossAmount || f.grossAmount <= 0) e.grossAmount = 'Informe o valor';
    if (!f.month) e.month = 'Informe o mês do funil';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await save.mutateAsync(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'POSSIBLE_DUPLICATE' && (await confirm({ title: 'Possível duplicidade', message: err.message, confirmLabel: 'Salvar mesmo assim', tone: 'primary' })))
        await save.mutateAsync(true).catch(() => undefined);
    }
  };

  const sold = opportunity?.status === 'VENDA_EFETUADA';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={opportunity ? 'Consultar / editar oportunidade' : 'Nova oportunidade'}
      subtitle="Funil quente do mês"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      {opportunity && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-field px-3 py-2 text-[12.5px] text-ink-soft">
          <Pill tone={OPP_STATUS[opportunity.status].tone}>{OPP_STATUS[opportunity.status].label}</Pill>
          {opportunity.postponedCount > 0 && <Pill tone="violet">Adiada {opportunity.postponedCount}x (origem: {monthLabel(opportunity.originalMonth, true)})</Pill>}
          <span>Cadastrada em {dateBR(opportunity.createdAt.slice(0, 10))}</span>
          {sold && <span>· Valor da venda: {brl$(opportunity.grossAmount)} (edite em Faturamento)</span>}
        </div>
      )}
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Cliente" htmlFor="o-client" error={errors.client} className="sm:col-span-2">
          <Input id="o-client" icon={<User />} value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} invalid={!!errors.client} />
        </Field>
        <Field label="Valor da proposta (bruto)" error={errors.grossAmount}>
          <MoneyInput id="o-gross" value={f.grossAmount} onChange={(v) => setF({ ...f, grossAmount: v })} invalid={!!errors.grossAmount} />
        </Field>
        <Field label="Mês do funil" htmlFor="o-month" error={errors.month}>
          <Input id="o-month" type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} />
        </Field>
        <Field label="Previsão de fechamento (opcional)" htmlFor="o-date" hint="Aparece no calendário">
          <Input id="o-date" type="date" icon={<CalendarClock />} value={f.expectedDate} onChange={(e) => setF({ ...f, expectedDate: e.target.value })} />
        </Field>
        <Field label="Responsável" htmlFor="o-owner">
          <Input id="o-owner" icon={<UserCheck />} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
        </Field>
        <Field label="Descrição" htmlFor="o-desc" className="sm:col-span-2">
          <Input id="o-desc" icon={<FileText />} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Observações" htmlFor="o-notes" className="sm:col-span-2">
          <Textarea id="o-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
