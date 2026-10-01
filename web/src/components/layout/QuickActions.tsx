import { createContext, useContext, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ReceivableForm } from '../../features/billing/ReceivableForm';
import { SaleDialog, type SaleDialogMode } from '../../features/billing/SaleDialog';
import { ExpenseForm } from '../../features/expenses/ExpenseForm';
import { OpportunityForm } from '../../features/funnel/OpportunityForm';
import { api } from '../../lib/api';
import type { ExpenseRow, Opportunity, ReceivableRow, SaleDetail } from '../../lib/types';

/** Abre cadastros/consultas de qualquer tela (botão +, dashboard, calendário, listas). */
interface Ctx {
  newOpportunity: () => void;
  openOpportunity: (o: Opportunity) => void;
  convertOpportunity: (o: Opportunity) => void;
  newSale: () => void;
  openSale: (id: string) => Promise<void>;
  newReceivable: () => void;
  openReceivable: (r: ReceivableRow) => void;
  newExpense: () => void;
  openExpense: (e: ExpenseRow) => void;
  openById: (kind: 'RECEITA' | 'DESPESA' | 'OPORTUNIDADE' | 'VENDA', id: string) => Promise<void>;
}
const QA = createContext<Ctx | null>(null);

type State = { kind: 'opp'; item: Opportunity | null } | { kind: 'rec'; item: ReceivableRow | null } | { kind: 'exp'; item: ExpenseRow | null } | null;

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [sale, setSale] = useState<SaleDialogMode | null>(null);
  const close = () => setState(null);
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const value: Ctx = {
    newOpportunity: () => setState({ kind: 'opp', item: null }),
    openOpportunity: (o) => setState({ kind: 'opp', item: o }),
    convertOpportunity: (o) => setSale({ kind: 'convert', opportunity: o }),
    newSale: () => setSale({ kind: 'new' }),
    openSale: (id) => guard(async () => setSale({ kind: 'edit', sale: await api.get<SaleDetail>(`/api/sales/${id}`) })),
    newReceivable: () => setState({ kind: 'rec', item: null }),
    openReceivable: (r) => setState({ kind: 'rec', item: r }),
    newExpense: () => setState({ kind: 'exp', item: null }),
    openExpense: (e) => setState({ kind: 'exp', item: e }),
    openById: (kind, id) =>
      guard(async () => {
        if (kind === 'RECEITA') setState({ kind: 'rec', item: await api.get<ReceivableRow>(`/api/receivables/${id}`) });
        else if (kind === 'DESPESA') setState({ kind: 'exp', item: await api.get<ExpenseRow>(`/api/expenses/${id}`) });
        else if (kind === 'OPORTUNIDADE') setState({ kind: 'opp', item: await api.get<Opportunity>(`/api/opportunities/${id}`) });
        else setSale({ kind: 'edit', sale: await api.get<SaleDetail>(`/api/sales/${id}`) });
      }),
  };
  return (
    <QA.Provider value={value}>
      {children}
      <OpportunityForm open={state?.kind === 'opp'} onClose={close} opportunity={state?.kind === 'opp' ? state.item : null} />
      <ReceivableForm open={state?.kind === 'rec'} onClose={close} receivable={state?.kind === 'rec' ? state.item : null} />
      <ExpenseForm open={state?.kind === 'exp'} onClose={close} expense={state?.kind === 'exp' ? state.item : null} />
      <SaleDialog mode={sale} onClose={() => setSale(null)} />
    </QA.Provider>
  );
}

export function useQuickActions() {
  const c = useContext(QA);
  if (!c) throw new Error('useQuickActions fora do provider');
  return c;
}
