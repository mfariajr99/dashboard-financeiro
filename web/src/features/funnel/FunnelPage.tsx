import clsx from 'clsx';
import { CalendarArrowUp, CheckCircle2, Eye, Flame, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useQuickActions } from '../../components/layout/QuickActions';
import { PageHeader, SearchInput } from '../../components/ui/ListToolbar';
import { useConfirm } from '../../components/ui/modal';
import { Button, Card, EmptyState, ErrorState, IconButton, Pill, Segmented, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { addMonths } from '../../lib/dates';
import { brl$, brlC, dateBR, monthLabel, pct, pctGoal } from '../../lib/format';
import { OPP_STATUS } from '../../lib/labels';
import { MonthPicker, useMonth } from '../../lib/month';
import { useDashboard, useFinMutation, useOpportunities } from '../../lib/queries';
import type { Opportunity, OpportunityStatus } from '../../lib/types';

type Tab = 'ABERTA' | 'VENDA_EFETUADA' | 'DECLINOU' | 'TODAS';

export default function FunnelPage() {
  const { month } = useMonth();
  const qa = useQuickActions();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('ABERTA');
  const [q, setQ] = useState('');
  const list = useOpportunities({ month, status: tab === 'TODAS' ? undefined : tab, q: q || undefined });
  const all = useOpportunities({ month });
  const dash = useDashboard(month);
  const s = dash.data?.sales;
  const count = (st: OpportunityStatus) => all.data?.filter((o) => o.status === st).length ?? 0;

  const setStatus = useFinMutation((v: { id: string; status: 'ABERTA' | 'DECLINOU' | 'PROXIMO_MES' }) => api.patch(`/api/opportunities/${v.id}/status`, { status: v.status }), {
    success: (r) => ((r as Opportunity).month !== month ? `Movida para o funil de ${monthLabel((r as Opportunity).month).toLowerCase()}` : 'Status atualizado'),
  });
  const del = useFinMutation((id: string) => api.del(`/api/opportunities/${id}`), { success: 'Oportunidade excluída' });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Funil quente"
        subtitle="Oportunidades do mês: venda efetuada, declinou ou próximo mês"
        actions={
          <>
            <MonthPicker />
            <Button icon={<Plus className="h-4 w-4" />} onClick={qa.newOpportunity}>
              Nova oportunidade
            </Button>
          </>
        }
      />

      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Kpi label="Funil quente em aberto" value={s ? brlC(s.funnel) : '…'} hint={s ? `${s.funnelCount} oportunidade(s)` : ''} color="#8B5CF6" />
        <Kpi label="Vendas efetuadas" value={s ? brlC(s.sold) : '…'} hint={s ? `${s.soldCount} venda(s) · ${pctGoal(s.percent)} da meta` : ''} color="#0A9AD8" />
        <Kpi label="Meta de vendas" value={s ? (s.goal ? brlC(s.goal) : 'Sem meta') : '…'} hint={s && s.goal ? `Falta ${brlC(s.remaining)}` : 'Cadastre em Metas'} />
        <Kpi label="Funil cobre o que falta" value={s ? (s.remaining === 0 && s.goal ? 'Meta atingida' : pct(s.funnelCoverage)) : '…'} hint={s ? `${dash.data?.days.businessDaysRemaining} dia(s) útil(eis) restantes` : ''} />
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          className="overflow-x-auto"
          options={[
            { value: 'ABERTA', label: `Em aberto (${count('ABERTA')})` },
            { value: 'VENDA_EFETUADA', label: `Efetuadas (${count('VENDA_EFETUADA')})` },
            { value: 'DECLINOU', label: `Declinou (${count('DECLINOU')})` },
            { value: 'TODAS', label: 'Todas' },
          ]}
        />
        <div className="flex-1">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente" />
        </div>
      </div>

      {list.isError ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Flame className="h-6 w-6" />} title="Nenhuma oportunidade" description={`Nada ${tab === 'ABERTA' ? 'em aberto' : 'nesta situação'} no funil de ${monthLabel(month).toLowerCase()}.`} action={<Button onClick={qa.newOpportunity}>Nova oportunidade</Button>} />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((o) => (
            <li key={o.id} className={clsx('card flex flex-col p-4', o.status === 'DECLINOU' && 'opacity-75')}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => qa.openOpportunity(o)}>
                  <p className="truncate font-semibold text-ink-title hover:text-accent">{o.client}</p>
                  <p className="label truncate">{[o.description, o.owner].filter(Boolean).join(' · ') || 'Sem descrição'}</p>
                </button>
                <div className="flex shrink-0">
                  <IconButton label="Consultar / editar" onClick={() => (o.status === 'VENDA_EFETUADA' && o.saleId ? qa.openSale(o.saleId) : qa.openOpportunity(o))}>
                    <Eye className="h-[18px] w-[18px]" />
                  </IconButton>
                  <IconButton
                    label="Excluir"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir oportunidade?', message: o.status === 'VENDA_EFETUADA' ? 'A venda gerada continua no Faturamento.' : `${o.client} — ${brl$(o.grossAmount)}`, confirmLabel: 'Excluir' })) del.mutate(o.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone={OPP_STATUS[o.status].tone}>{OPP_STATUS[o.status].label}</Pill>
                {o.postponedCount > 0 && <Pill tone="violet">Adiada {o.postponedCount}x</Pill>}
                {o.expectedDate && <Pill>Previsão {dateBR(o.expectedDate)}</Pill>}
              </div>
              <p className="kpi-value mt-3 text-[22px]">{brl$(o.grossAmount)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {o.status === 'ABERTA' ? (
                  <>
                    <Button size="sm" variant="success" className="px-2" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => qa.convertOpportunity(o)}>
                      Venda
                    </Button>
                    <Button size="sm" variant="secondary" className="px-2" icon={<CalendarArrowUp className="h-4 w-4" />} onClick={() => setStatus.mutate({ id: o.id, status: 'PROXIMO_MES' })} title={`Mover para ${monthLabel(addMonths(o.month, 1))}`}>
                      Próx. mês
                    </Button>
                    <Button size="sm" variant="secondary" className="px-2 text-[#F87171]" icon={<XCircle className="h-4 w-4" />} onClick={() => setStatus.mutate({ id: o.id, status: 'DECLINOU' })}>
                      Declinou
                    </Button>
                  </>
                ) : o.status === 'DECLINOU' ? (
                  <Button size="sm" variant="secondary" className="col-span-3" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setStatus.mutate({ id: o.id, status: 'ABERTA' })}>
                    Reabrir no funil
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" className="col-span-3" icon={<Eye className="h-4 w-4" />} onClick={() => o.saleId && qa.openSale(o.saleId)}>
                    Ver venda e recebimentos
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="label flex items-center gap-1.5 truncate">
        {color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />}
        {label}
      </p>
      <p className="kpi-value truncate text-[17px] sm:text-[20px]">{value}</p>
      {hint && <p className="truncate text-[11.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}
