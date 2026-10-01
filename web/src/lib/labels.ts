import type { ExpenseSituation, OpportunityStatus, PaymentMethod, ReceivableSituation } from './types';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet' | 'primary';

export const METHOD_LABEL: Record<PaymentMethod, string> = { PIX: 'Pix', BOLETO: 'Boleto', CARTAO: 'Cartão' };

export const OPP_STATUS: Record<OpportunityStatus, { label: string; tone: Tone }> = {
  ABERTA: { label: 'Em aberto', tone: 'warning' },
  VENDA_EFETUADA: { label: 'Venda efetuada', tone: 'success' },
  DECLINOU: { label: 'Declinou', tone: 'danger' },
};

export const REC_SITUATION: Record<ReceivableSituation, { label: string; tone: Tone }> = {
  RECEBIDO: { label: 'Recebido', tone: 'success' },
  EM_ABERTO: { label: 'Em aberto', tone: 'danger' },
  A_VENCER: { label: 'A vencer', tone: 'info' },
};

export const EXP_SITUATION: Record<ExpenseSituation, { label: string; tone: Tone }> = {
  PAGA: { label: 'Paga', tone: 'success' },
  EM_ABERTO: { label: 'Em aberto', tone: 'danger' },
  A_VENCER: { label: 'A vencer', tone: 'info' },
};

/** Cores do sistema (dashboard, calendário). Verde = entrou, vermelho = em aberto/vencido, azul = a vencer. */
export const COLORS = {
  received: '#10B981',
  open: '#EF4444',
  upcoming: '#38BDF8',
  sold: '#0A9AD8',
  funnel: '#8B5CF6',
  goal: '#CBD5E1',
  expense: '#F59E0B',
  profit: '#10B981',
  loss: '#EF4444',
};

export const EXPENSE_CATEGORIES = ['Pessoal', 'Estrutura', 'Impostos', 'Software', 'Marketing', 'Fornecedores', 'Operacional', 'Outros'];
