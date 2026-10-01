/**
 * Dashboard Financeiro — modelo de dados (v2, simplificado).
 * Valores monetários: string decimal "1234.56" (NUMERIC no banco). Datas: "YYYY-MM-DD". Mês: "YYYY-MM".
 * Este arquivo é puro (sem banco/Node) e é usado pelo servidor e pelo ambiente de teste em HTML.
 */
import type { ISODate, MonthKey } from './dates';
import type { PaymentMethod } from './money';

export type { ISODate, MonthKey, PaymentMethod };

interface Stamped {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Funil quente. "Próximo mês" não é um status gravado: move a oportunidade para o mês seguinte. */
export type OpportunityStatus = 'ABERTA' | 'VENDA_EFETUADA' | 'DECLINOU';

export interface Opportunity extends Stamped {
  client: string;
  description: string | null;
  grossAmount: string;
  /** Mês do funil (competência). */
  month: MonthKey;
  /** Data prevista de fechamento (opcional, aparece no calendário). */
  expectedDate: ISODate | null;
  owner: string | null;
  status: OpportunityStatus;
  /** Quantas vezes foi empurrada para o mês seguinte. */
  postponedCount: number;
  originalMonth: MonthKey;
  saleId: string | null;
  notes: string | null;
}

/** Venda efetuada: o valor BRUTO conta para a meta de vendas do mês da venda. */
export interface Sale extends Stamped {
  opportunityId: string | null;
  client: string;
  description: string | null;
  grossAmount: string;
  saleDate: ISODate;
  month: MonthKey;
  paymentMethod: PaymentMethod;
  installments: number;
  feeRate: string; // 0.1900 no cartão; 0 em Pix/Boleto
  feeAmount: string;
  netAmount: string;
  notes: string | null;
}

/** Receita programada (faturamento): parcela de uma venda ou receita avulsa. Valor LÍQUIDO entra no faturamento. */
export type ReceivableStatus = 'A_RECEBER' | 'RECEBIDO';
export type ReceivableSituation = 'RECEBIDO' | 'EM_ABERTO' | 'A_VENCER';

export interface Receivable extends Stamped {
  saleId: string | null;
  client: string;
  description: string | null;
  paymentMethod: PaymentMethod;
  installmentNumber: number;
  installmentCount: number;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  /** Data do pagamento (Pix/Boleto) ou da disponibilidade do recurso (Cartão). */
  dueDate: ISODate;
  status: ReceivableStatus;
  receivedDate: ISODate | null;
  notes: string | null;
}

export type ExpenseStatus = 'PENDENTE' | 'PAGA';
export type ExpenseSituation = 'PAGA' | 'EM_ABERTO' | 'A_VENCER';

export interface Expense extends Stamped {
  name: string;
  category: string | null;
  supplier: string | null;
  amount: string;
  dueDate: ISODate;
  status: ExpenseStatus;
  paidDate: ISODate | null;
  /** Série de despesas repetidas (mesmo seriesId). */
  seriesId: string | null;
  seriesIndex: number | null;
  seriesCount: number | null;
  notes: string | null;
}

export interface Goal extends Stamped {
  month: MonthKey;
  salesGoal: string;
  billingGoal: string;
}

export interface Settings {
  cardFeeRate: number; // 0.19
  timezone: string;
  companyName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  cardFeeRate: 0.19,
  timezone: 'America/Sao_Paulo',
  companyName: 'Dashboard Financeiro',
};
