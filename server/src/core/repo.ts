/**
 * Contrato de persistência. O servidor implementa com Drizzle/PostgreSQL; o ambiente de teste
 * implementa em memória (localStorage). Toda a regra de negócio (services.ts) usa só esta interface.
 */
import type { Expense, Goal, Opportunity, Receivable, Sale, Settings } from './types';

type Row = { id: string };
export type NewRow<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

export interface Table<T extends Row> {
  all(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  insert(row: NewRow<T>): Promise<T>;
  update(id: string, patch: Partial<NewRow<T>>): Promise<T | undefined>;
  remove(id: string): Promise<boolean>;
}

export interface Repo {
  opportunities: Table<Opportunity>;
  sales: Table<Sale>;
  receivables: Table<Receivable>;
  expenses: Table<Expense>;
  goals: Table<Goal>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Settings>;
  audit(action: string, entity: string, entityId?: string | null): Promise<void>;
  /** Executa várias gravações de forma atômica. */
  transaction<R>(fn: (repo: Repo) => Promise<R>): Promise<R>;
}

export interface RequestContext {
  today: string;
  userId: string | null;
}
