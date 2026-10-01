/**
 * Repositório em memória (usado pelo ambiente de teste em HTML e pelos testes unitários).
 * `onChange` permite persistir o estado (ex.: localStorage) após cada gravação.
 */
import type { NewRow, Repo, Table } from './repo';
import { DEFAULT_SETTINGS, type DebtInstallment, type Expense, type Goal, type Opportunity, type PersonalDebt, type PersonalExpense, type PersonalMonth, type Receivable, type Sale, type Settings } from './types';

export interface MemoryState {
  opportunities: Opportunity[];
  sales: Sale[];
  receivables: Receivable[];
  expenses: Expense[];
  goals: Goal[];
  // Conta pessoal (podem faltar em dados salvos por versões anteriores)
  personalExpenses?: PersonalExpense[];
  personalDebts?: PersonalDebt[];
  debtInstallments?: DebtInstallment[];
  personalMonths?: PersonalMonth[];
  settings: Settings;
  audit: { at: string; action: string; entity: string; entityId: string | null }[];
}

export function emptyState(): MemoryState {
  return { opportunities: [], sales: [], receivables: [], expenses: [], goals: [], personalExpenses: [], personalDebts: [], debtInstallments: [], personalMonths: [], settings: { ...DEFAULT_SETTINGS }, audit: [] };
}

export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* sem randomUUID */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type Key = 'opportunities' | 'sales' | 'receivables' | 'expenses' | 'goals' | 'personalExpenses' | 'personalDebts' | 'debtInstallments' | 'personalMonths';

export class MemoryRepo implements Repo {
  constructor(
    public state: MemoryState = emptyState(),
    private onChange: (s: MemoryState) => void = () => {},
  ) {}

  private table<T extends { id: string; createdAt: string; updatedAt: string }>(key: Key): Table<T> {
    const rows = () => (this.state[key] ??= []) as unknown as T[];
    const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));
    return {
      all: async () => clone(rows()),
      get: async (id) => {
        const r = rows().find((x) => x.id === id);
        return r ? clone(r) : undefined;
      },
      insert: async (row: NewRow<T>) => {
        const now = new Date().toISOString();
        const r = { ...(row as object), id: newId(), createdAt: now, updatedAt: now } as T;
        rows().push(r);
        this.changed();
        return clone(r);
      },
      update: async (id, patch) => {
        const r = rows().find((x) => x.id === id);
        if (!r) return undefined;
        Object.assign(r, patch, { updatedAt: new Date().toISOString() });
        this.changed();
        return clone(r);
      },
      remove: async (id) => {
        const before = rows().length;
        (this.state[key] as unknown as T[]) = rows().filter((x) => x.id !== id);
        this.changed();
        return rows().length < before;
      },
    };
  }

  opportunities = this.table<Opportunity>('opportunities');
  sales = this.table<Sale>('sales');
  receivables = this.table<Receivable>('receivables');
  expenses = this.table<Expense>('expenses');
  goals = this.table<Goal>('goals');
  personalExpenses = this.table<PersonalExpense>('personalExpenses');
  personalDebts = this.table<PersonalDebt>('personalDebts');
  debtInstallments = this.table<DebtInstallment>('debtInstallments');
  personalMonths = this.table<PersonalMonth>('personalMonths');

  private depth = 0;
  private changed() {
    if (this.depth === 0) this.onChange(this.state);
  }

  async getSettings() {
    return { ...DEFAULT_SETTINGS, ...this.state.settings };
  }
  async saveSettings(s: Settings) {
    this.state.settings = { ...s };
    this.changed();
    return { ...s };
  }
  async audit(action: string, entity: string, entityId?: string | null) {
    this.state.audit.unshift({ at: new Date().toISOString(), action, entity, entityId: entityId ?? null });
    this.state.audit = this.state.audit.slice(0, 300);
  }
  /** Transação: em caso de erro, restaura o estado anterior. */
  async transaction<R>(fn: (repo: Repo) => Promise<R>): Promise<R> {
    const snapshot = JSON.stringify(this.state);
    this.depth++;
    try {
      const r = await fn(this);
      this.depth--;
      this.changed();
      return r;
    } catch (err) {
      this.depth--;
      Object.assign(this.state, JSON.parse(snapshot));
      throw err;
    }
  }
}
