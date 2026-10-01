import { Copy, Goal, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/ui/ListToolbar';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Button, Card, CardHeader, ErrorState, Segmented, Skeleton } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import { brlC, monthLabel } from '../../lib/format';
import { useMonth } from '../../lib/month';
import { useFinMutation, useGoals } from '../../lib/queries';

type Row = { month: string; salesGoal: number | null; billingGoal: number | null };

/** Metas de vendas e de faturamento — grade de janeiro a dezembro. */
export default function GoalsPage() {
  const { month } = useMonth();
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const q = useGoals(year);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (q.data) {
      setRows(q.data.map((g) => ({ month: g.month, salesGoal: Number(g.salesGoal), billingGoal: Number(g.billingGoal) })));
      setDirty(false);
    }
  }, [q.data]);
  const save = useFinMutation(() => api.put(`/api/goals/year/${year}`, rows.map((r) => ({ month: r.month, salesGoal: r.salesGoal ?? 0, billingGoal: r.billingGoal ?? 0 }))), { success: `Metas de ${year} salvas` });
  const set = (i: number, k: 'salesGoal' | 'billingGoal', v: number | null) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
    setDirty(true);
  };
  const fillDown = (i: number) => {
    setRows(rows.map((r, j) => (j > i ? { ...r, salesGoal: rows[i].salesGoal, billingGoal: rows[i].billingGoal } : r)));
    setDirty(true);
  };
  const sum = (k: 'salesGoal' | 'billingGoal') => Math.round(rows.reduce((a, r) => a + (r[k] ?? 0), 0) * 100);
  const thisYear = Number(month.slice(0, 4));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Metas"
        subtitle="Meta de vendas (bruto) e meta de faturamento por mês"
        actions={
          <>
            <Segmented value={String(year)} onChange={(v) => setYear(Number(v))} options={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: String(y), label: String(y) }))} />
            <Button icon={<Save className="h-4 w-4" />} onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!dirty}>
              Salvar metas
            </Button>
          </>
        }
      />
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      <Card>
        <CardHeader title={`Metas de ${year}`} subtitle="Use o botão de copiar para repetir os valores nos meses seguintes" icon={<Goal className="h-5 w-5" />} />
        <div className="p-3 sm:p-5">
          {!q.data ? (
            <Skeleton className="h-96" />
          ) : (
            <>
              <div className="mb-2 hidden grid-cols-[140px_1fr_1fr_44px] gap-3 px-1 text-[12px] italic text-ink-muted sm:grid">
                <span>Mês</span>
                <span>Meta de vendas</span>
                <span>Meta de faturamento</span>
                <span />
              </div>
              <ul className="space-y-2">
                {rows.map((r, i) => (
                  <li key={r.month} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-line bg-field/40 p-2.5 sm:grid-cols-[140px_1fr_1fr_44px] sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0">
                    <span className="col-span-2 flex items-center justify-between text-[13.5px] font-semibold capitalize text-ink-title sm:col-span-1">
                      {monthLabel(r.month).replace(` de ${year}`, '')}
                      <button type="button" onClick={() => fillDown(i)} className="focus-ring flex h-9 items-center gap-1 rounded-lg px-2 text-[11.5px] font-normal text-accent sm:hidden">
                        <Copy className="h-3.5 w-3.5" /> Copiar p/ seguintes
                      </button>
                    </span>
                    <label className="block">
                      <span className="label sm:hidden">Vendas</span>
                      <MoneyInput value={r.salesGoal} onChange={(v) => set(i, 'salesGoal', v)} />
                    </label>
                    <label className="block">
                      <span className="label sm:hidden">Faturamento</span>
                      <MoneyInput value={r.billingGoal} onChange={(v) => set(i, 'billingGoal', v)} />
                    </label>
                    <button type="button" title="Copiar para os meses seguintes" aria-label={`Copiar metas de ${r.month} para os meses seguintes`} onClick={() => fillDown(i)} className="focus-ring hidden h-11 w-11 items-center justify-center rounded-field text-ink-muted hover:bg-elevated hover:text-accent sm:flex">
                      <Copy className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-[140px_1fr_1fr_44px]">
                <span className="col-span-2 text-[13.5px] font-semibold sm:col-span-1">Total do ano</span>
                <span className="kpi-value text-[16px]">{brlC(sum('salesGoal'))}</span>
                <span className="kpi-value text-[16px]">{brlC(sum('billingGoal'))}</span>
              </div>
              {dirty && <p className="mt-3 text-[12.5px] text-[#FBBF24]">Há alterações não salvas.</p>}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
