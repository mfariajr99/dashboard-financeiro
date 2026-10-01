/** Implementação PostgreSQL (Drizzle) do contrato Repo usado pelas regras de negócio (src/core). */
import { eq, inArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { NewRow, Repo, Table } from '../core/repo';
import { DEFAULT_SETTINGS, type Expense, type Goal, type Opportunity, type Receivable, type Sale, type Settings } from '../core/types';
import { db as rootDb, type DB, type Tx } from './client';
import { appSettings, auditLogs, expenses, goals, opportunities, receivables, sales } from './schema';

type Exec = DB | Tx;
type AnyTable = PgTable & { id: Parameters<typeof eq>[0] };

/** Datas de auditoria (Date do driver) → ISO string, como no tipo de domínio. */
function norm<T>(rows: unknown[]): T[] {
  return rows.map((r) => {
    const o = { ...(r as Record<string, unknown>) };
    for (const k of ['createdAt', 'updatedAt']) if (o[k] instanceof Date) o[k] = (o[k] as Date).toISOString();
    return o as T;
  });
}

function table<T extends { id: string }>(exec: Exec, t: AnyTable): Table<T> {
  return {
    all: async () => norm<T>(await exec.select().from(t)),
    get: async (id) => norm<T>(await exec.select().from(t).where(eq(t.id, id)).limit(1))[0],
    insert: async (row: NewRow<T>) => norm<T>(await exec.insert(t).values(row as never).returning())[0],
    update: async (id, patch) => {
      if (!Object.keys(patch).length) return norm<T>(await exec.select().from(t).where(eq(t.id, id)))[0];
      const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'createdAt' && k !== 'updatedAt' && k !== 'id'));
      return norm<T>(await exec.update(t).set(clean as never).where(eq(t.id, id)).returning())[0];
    },
    remove: async (id) => (await exec.delete(t).where(eq(t.id, id)).returning()).length > 0,
  };
}

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export class DrizzleRepo implements Repo {
  opportunities: Table<Opportunity>;
  sales: Table<Sale>;
  receivables: Table<Receivable>;
  expenses: Table<Expense>;
  goals: Table<Goal>;
  constructor(
    private exec: Exec = rootDb,
    private userId: string | null = null,
  ) {
    this.opportunities = table<Opportunity>(exec, opportunities as unknown as AnyTable);
    this.sales = table<Sale>(exec, sales as unknown as AnyTable);
    this.receivables = table<Receivable>(exec, receivables as unknown as AnyTable);
    this.expenses = table<Expense>(exec, expenses as unknown as AnyTable);
    this.goals = table<Goal>(exec, goals as unknown as AnyTable);
  }

  async getSettings(): Promise<Settings> {
    const rows = await this.exec.select().from(appSettings).where(inArray(appSettings.key, SETTING_KEYS));
    const s: Settings = { ...DEFAULT_SETTINGS };
    for (const r of rows) (s as unknown as Record<string, unknown>)[r.key] = r.value;
    return s;
  }
  async saveSettings(s: Settings): Promise<Settings> {
    for (const key of SETTING_KEYS)
      await this.exec
        .insert(appSettings)
        .values({ key, value: s[key] })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: s[key], updatedAt: new Date() } });
    return this.getSettings();
  }
  async audit(action: string, entity: string, entityId?: string | null) {
    await this.exec.insert(auditLogs).values({ action, entity, entityId: entityId ?? null, userId: this.userId });
  }
  async transaction<R>(fn: (repo: Repo) => Promise<R>): Promise<R> {
    // Já dentro de uma transação: reutiliza (evita transações aninhadas).
    if (this.exec !== rootDb) return fn(this);
    return rootDb.transaction((tx) => fn(new DrizzleRepo(tx, this.userId)));
  }
}
