import clsx from 'clsx';
import { CheckCircle2, Eye, Plus, RotateCcw, ShoppingCart, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useQuickActions } from '../../components/layout/QuickActions';
import { ChipGroup, PageHeader, SearchInput } from '../../components/ui/ListToolbar';
import { useConfirm } from '../../components/ui/modal';
import { Button, Card, EmptyState, ErrorState, IconButton, Pill, Segmented, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { brl$, brlC, dateBR, monthLabel } from '../../lib/format';
import { COLORS, METHOD_LABEL, REC_SITUATION } from '../../lib/labels';
import { MonthPicker, useMonth } from '../../lib/month';
import { useDashboard, useFinMutation, useReceivables, useSales } from '../../lib/queries';
import type { ReceivableSituation } from '../../lib/types';

export default function BillingPage() {
  const { month } = useMonth();
  const qa = useQuickActions();
  const [tab, setTab] = useState<'receitas' | 'vendas'>('receitas');
  const dash = useDashboard(month);
  const b = dash.data?.billing;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Faturamento"
        subtitle="Receitas programadas para recebimento e vendas efetuadas"
        actions={
          <>
            <MonthPicker />
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={qa.newReceivable}>
              Nova receita
            </Button>
            <Button icon={<ShoppingCart className="h-4 w-4" />} onClick={qa.newSale}>
              Nova venda
            </Button>
          </>
        }
      />
      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Box label="Total do mês" value={b ? brlC(b.total) : '…'} />
        <Box label="Já recebido" value={b ? brlC(b.received) : '…'} color={COLORS.received} />
        <Box label="Em aberto (vencido)" value={b ? brlC(b.open) : '…'} color={COLORS.open} danger={!!b?.open} />
        <Box label="A vencer" value={b ? brlC(b.upcoming) : '…'} color={COLORS.upcoming} />
      </Card>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'receitas', label: 'Receitas programadas' },
          { value: 'vendas', label: 'Vendas efetuadas' },
        ]}
      />
      {tab === 'receitas' ? <ReceivablesList month={month} /> : <SalesList month={month} />}
    </div>
  );
}

function Box({ label, value, color, danger }: { label: string; value: string; color?: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="label flex items-center gap-1.5 truncate">
        {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
        {label}
      </p>
      <p className={clsx('kpi-value truncate text-[17px] sm:text-[20px]', danger && 'text-[#F87171]')}>{value}</p>
    </div>
  );
}

function ReceivablesList({ month }: { month: string }) {
  const qa = useQuickActions();
  const confirm = useConfirm();
  const [sit, setSit] = useState<ReceivableSituation[]>([]);
  const [q, setQ] = useState('');
  const list = useReceivables({ month, q: q || undefined });
  const receive = useFinMutation((id: string) => api.patch(`/api/receivables/${id}/receive`, {}), { success: 'Recebimento confirmado' });
  const undo = useFinMutation((id: string) => api.patch(`/api/receivables/${id}/unreceive`, {}), { success: 'Recebimento desfeito' });
  const del = useFinMutation((id: string) => api.del(`/api/receivables/${id}`), { success: 'Receita excluída' });
  const items = (list.data ?? []).filter((r) => !sit.length || sit.includes(r.situation));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <ChipGroup label="Situação" value={sit} onChange={setSit} options={(['EM_ABERTO', 'A_VENCER', 'RECEBIDO'] as ReceivableSituation[]).map((s) => ({ value: s, label: REC_SITUATION[s].label }))} />
        <div className="flex-1">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente" />
        </div>
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <Skeleton className="h-60" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Wallet className="h-6 w-6" />} title="Nenhuma receita" description={`Sem receitas programadas em ${monthLabel(month).toLowerCase()} com esse filtro.`} action={<Button onClick={qa.newReceivable}>Nova receita</Button>} />
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className={clsx('card flex items-center gap-3 p-3 sm:p-3.5', r.situation === 'EM_ABERTO' && 'border-danger/40')}>
              <div className="w-14 shrink-0 text-center">
                <p className="text-[18px] font-bold leading-none text-white">{r.dueDate.slice(8)}</p>
                <p className="text-[11px] italic text-ink-muted">{dateBR(r.dueDate).slice(3, 5)}/{r.dueDate.slice(2, 4)}</p>
              </div>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => qa.openReceivable(r)}>
                <p className="truncate font-medium text-ink-title hover:text-accent">{r.client}</p>
                <p className="label truncate">
                  {METHOD_LABEL[r.paymentMethod]}
                  {r.installmentCount > 1 ? ` · parcela ${r.installmentNumber}/${r.installmentCount}` : ''}
                  {r.saleId ? '' : ' · avulsa'}
                  {Number(r.feeAmount) > 0 ? ` · bruto ${brl$(r.grossAmount)}` : ''}
                </p>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[15px] font-semibold tabular-nums text-white">{brl$(r.netAmount)}</span>
                <Pill tone={REC_SITUATION[r.situation].tone}>{REC_SITUATION[r.situation].label}</Pill>
              </div>
              <div className="flex shrink-0 flex-col sm:flex-row">
                {r.status === 'RECEBIDO' ? (
                  <IconButton label="Desfazer recebimento" onClick={() => undo.mutate(r.id)}>
                    <RotateCcw className="h-4 w-4" />
                  </IconButton>
                ) : (
                  <IconButton label="Marcar como recebida" className="text-success" onClick={() => receive.mutate(r.id)}>
                    <CheckCircle2 className="h-5 w-5" />
                  </IconButton>
                )}
                <IconButton label="Consultar / editar" onClick={() => qa.openReceivable(r)} className="hidden sm:inline-flex">
                  <Eye className="h-[18px] w-[18px]" />
                </IconButton>
                {!r.saleId && (
                  <IconButton
                    label="Excluir"
                    className="hidden sm:inline-flex"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir receita?', message: `${r.client} — ${brl$(r.netAmount)} em ${dateBR(r.dueDate)}`, confirmLabel: 'Excluir' })) del.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SalesList({ month }: { month: string }) {
  const qa = useQuickActions();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const list = useSales({ month, q: q || undefined });
  const del = useFinMutation((id: string) => api.del(`/api/sales/${id}`), { success: 'Venda excluída (a oportunidade voltou ao funil)' });
  const total = (list.data ?? []).reduce((a, s) => a + Number(s.grossAmount), 0);
  return (
    <div className="space-y-3">
      <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente" />
      {!list.data ? (
        <Skeleton className="h-60" />
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState icon={<ShoppingCart className="h-6 w-6" />} title="Nenhuma venda efetuada no mês" description="Marque oportunidades como 'Venda efetuada' no funil ou cadastre uma venda." action={<Button onClick={qa.newSale}>Nova venda</Button>} />
        </Card>
      ) : (
        <>
          <p className="text-[12.5px] text-ink-soft">
            {list.data.length} venda(s) em {monthLabel(month).toLowerCase()} · total bruto <b className="text-white">{brl$(total)}</b> (conta na meta)
          </p>
          <ul className="space-y-2">
            {list.data.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 p-3 sm:p-3.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => qa.openSale(s.id)}>
                  <p className="truncate font-medium text-ink-title hover:text-accent">{s.client}</p>
                  <p className="label truncate">
                    {dateBR(s.saleDate)} · {METHOD_LABEL[s.paymentMethod]} {s.installments}x{Number(s.feeAmount) > 0 ? ` · líquido ${brl$(s.netAmount)}` : ''}
                  </p>
                  <p className="text-[11.5px] text-ink-faint">
                    {s.receivedCount}/{s.installments} recebida(s){s.openCount ? ` · ${s.openCount} em aberto` : ''}{s.nextDueDate ? ` · próxima ${dateBR(s.nextDueDate)}` : ''}
                  </p>
                </button>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-white">{brl$(s.grossAmount)}</span>
                <div className="flex shrink-0">
                  <IconButton label="Consultar / editar" onClick={() => qa.openSale(s.id)}>
                    <Eye className="h-[18px] w-[18px]" />
                  </IconButton>
                  <IconButton
                    label="Excluir venda"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir venda?', message: 'As parcelas programadas serão removidas e a oportunidade de origem volta ao funil.', confirmLabel: 'Excluir' })) del.mutate(s.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
