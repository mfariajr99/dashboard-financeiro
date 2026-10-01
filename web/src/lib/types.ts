/** Tipos das respostas da API. Entidades: valores em reais (string decimal). Visões (dashboard/calendário): centavos (number). */
export type {
  Expense,
  ExpenseSituation,
  Goal,
  Opportunity,
  OpportunityStatus,
  PaymentMethod,
  Receivable,
  ReceivableSituation,
  Sale,
  Settings as CoreSettings,
} from '../../../server/src/core/types';
export type { MonthDashboard, AnnualMonth, CalendarItem, CalendarKind } from '../../../server/src/core/calc';

import type { AnnualMonth, CalendarItem, MonthDashboard } from '../../../server/src/core/calc';
import type { DebtInstallment, PersonalDebt, Expense, ExpenseSituation, Opportunity, Receivable, ReceivableSituation, Sale, Settings as CoreSettings } from '../../../server/src/core/types';

export interface User {
  id: string;
  username: string;
  name: string | null;
  mustChangePassword: boolean;
}

export type Settings = CoreSettings & { today: string };

export interface Annual {
  year: number;
  months: AnnualMonth[];
  totalGoal: number;
  totalSold: number;
  percent: number | null;
  years: number[];
}

export type Dashboard = MonthDashboard & { annual: Annual };

export type ReceivableRow = Receivable & { situation: ReceivableSituation };
export type ReceivableDetail = ReceivableRow & { series: { id: string; dueDate: string; status: Receivable['status'] }[] };
export type ExpenseRow = Expense & { situation: ExpenseSituation };
export type ExpenseDetail = ExpenseRow & { series: { id: string; dueDate: string; status: Expense['status'] }[] };
export type SaleRow = Sale & { receivedCount: number; openCount: number; nextDueDate: string | null };
export type SaleDetail = Sale & { receivables: ReceivableRow[] };
export type OpportunityDetail = Opportunity & { sale: Sale | null };

export interface GoalRow {
  month: string;
  salesGoal: string;
  billingGoal: string;
  id: string | null;
}

export interface CalendarDay {
  date: string;
  isToday: boolean;
  holiday: string | null;
  inflow: number;
  outflow: number;
  items: CalendarItem[];
}
export interface CalendarResponse {
  from: string;
  to: string;
  today: string;
  days: CalendarDay[];
}

// ---------------------------------------------------------------- Conta pessoal
export type PersonalOverview = Awaited<ReturnType<typeof import('../../../server/src/core/services').personalOverview>>;
export type DebtStatus = 'QUITADA' | 'EM_DIA' | 'ATRASADA';
export type DebtRow = PersonalDebt & { paidCount: number; paidAmount: string; remainingAmount: string; nextDueDate: string | null; nextAmount: string | null; lastDueDate: string | null; status: DebtStatus };
export type DebtDetail = DebtRow & { installmentsList: DebtInstallment[] };
export type DebtInstallmentRow = DebtInstallment & { debtName: string; creditor: string | null; situation: ExpenseSituation };
export type { DebtInstallment, PersonalDebt };
