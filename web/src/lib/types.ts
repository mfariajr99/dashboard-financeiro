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
import type { Expense, ExpenseSituation, Opportunity, Receivable, ReceivableSituation, Sale, Settings as CoreSettings } from '../../../server/src/core/types';

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
export type ExpenseRow = Expense & { situation: ExpenseSituation };
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
