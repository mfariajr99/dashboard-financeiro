/**
 * Dashboard Financeiro — schema PostgreSQL (Drizzle ORM), versão 2 (simplificada).
 * - Valores: NUMERIC(14,2) (string no código, nunca float). Taxas: NUMERIC(7,4).
 * - Datas financeiras: DATE ('YYYY-MM-DD'). Competência/mês: 'YYYY-MM'.
 * - Os tipos de domínio ficam em src/core/types.ts; este arquivo só mapeia as tabelas.
 */
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const paymentMethodEnum = pgEnum('payment_method', ['PIX', 'BOLETO', 'CARTAO']);
export const opportunityStatusEnum = pgEnum('opportunity_status', ['ABERTA', 'VENDA_EFETUADA', 'DECLINOU']);
export const receivableStatusEnum = pgEnum('receivable_status', ['A_RECEBER', 'RECEBIDO']);
export const expenseStatusEnum = pgEnum('expense_status', ['PENDENTE', 'PAGA']);

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const day = (name: string) => date(name, { mode: 'string' });
const stamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  tokenVersion: integer('token_version').notNull().default(0),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Funil quente (por mês). */
export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    client: text('client').notNull(),
    description: text('description'),
    grossAmount: money('gross_amount').notNull(),
    month: text('month').notNull(),
    expectedDate: day('expected_date'),
    owner: text('owner'),
    status: opportunityStatusEnum('status').notNull().default('ABERTA'),
    postponedCount: integer('postponed_count').notNull().default(0),
    originalMonth: text('original_month').notNull(),
    saleId: uuid('sale_id'),
    notes: text('notes'),
    ...stamps,
  },
  (t) => [index('opportunities_month_idx').on(t.month, t.status)],
);

/** Vendas efetuadas (bruto conta na meta do mês). */
export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    opportunityId: uuid('opportunity_id'),
    client: text('client').notNull(),
    description: text('description'),
    grossAmount: money('gross_amount').notNull(),
    saleDate: day('sale_date').notNull(),
    month: text('month').notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    installments: integer('installments').notNull().default(1),
    feeRate: numeric('fee_rate', { precision: 7, scale: 4 }).notNull().default('0'),
    feeAmount: money('fee_amount').notNull().default('0'),
    netAmount: money('net_amount').notNull(),
    notes: text('notes'),
    ...stamps,
  },
  (t) => [index('sales_month_idx').on(t.month), uniqueIndex('sales_opportunity_uq').on(t.opportunityId).where(sql`opportunity_id is not null`)],
);

/** Receitas programadas (faturamento) — valor líquido entra no faturamento na data de pagamento/disponibilidade. */
export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'cascade' }),
    client: text('client').notNull(),
    description: text('description'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    installmentNumber: integer('installment_number').notNull().default(1),
    installmentCount: integer('installment_count').notNull().default(1),
    grossAmount: money('gross_amount').notNull(),
    feeAmount: money('fee_amount').notNull().default('0'),
    netAmount: money('net_amount').notNull(),
    dueDate: day('due_date').notNull(),
    status: receivableStatusEnum('status').notNull().default('A_RECEBER'),
    receivedDate: day('received_date'),
    notes: text('notes'),
    /** Receita avulsa recorrente: todas as receitas da mesma recorrência têm o mesmo id. */
    seriesId: text('series_id'),
    ...stamps,
  },
  (t) => [index('receivables_due_idx').on(t.dueDate), index('receivables_sale_idx').on(t.saleId), index('receivables_series_idx').on(t.seriesId)],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: text('category'),
    supplier: text('supplier'),
    amount: money('amount').notNull(),
    dueDate: day('due_date').notNull(),
    status: expenseStatusEnum('status').notNull().default('PENDENTE'),
    paidDate: day('paid_date'),
    seriesId: text('series_id'),
    seriesIndex: integer('series_index'),
    seriesCount: integer('series_count'),
    notes: text('notes'),
    ...stamps,
  },
  (t) => [index('expenses_due_idx').on(t.dueDate), index('expenses_series_idx').on(t.seriesId)],
);

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  month: text('month').notNull().unique(),
  salesGoal: money('sales_goal').notNull().default('0'),
  billingGoal: money('billing_goal').notNull().default('0'),
  ...stamps,
});

// ================================================================== CONTA PESSOAL
// Separada do dashboard da empresa: nenhuma destas tabelas entra nos cálculos da empresa.
export const personalExpenses = pgTable(
  'personal_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: text('category'),
    supplier: text('supplier'),
    amount: money('amount').notNull(),
    dueDate: day('due_date').notNull(),
    status: expenseStatusEnum('status').notNull().default('PENDENTE'),
    paidDate: day('paid_date'),
    seriesId: text('series_id'),
    seriesIndex: integer('series_index'),
    seriesCount: integer('series_count'),
    notes: text('notes'),
    ...stamps,
  },
  (t) => [index('personal_expenses_due_idx').on(t.dueDate), index('personal_expenses_series_idx').on(t.seriesId)],
);

export const personalDebts = pgTable('personal_debts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  creditor: text('creditor'),
  totalAmount: money('total_amount').notNull(),
  installments: integer('installments').notNull().default(1),
  dueDay: integer('due_day').notNull(),
  startMonth: text('start_month').notNull(),
  notes: text('notes'),
  ...stamps,
});

export const debtInstallments = pgTable(
  'debt_installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => personalDebts.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    count: integer('count').notNull(),
    amount: money('amount').notNull(),
    dueDate: day('due_date').notNull(),
    status: expenseStatusEnum('status').notNull().default('PENDENTE'),
    paidDate: day('paid_date'),
    ...stamps,
  },
  (t) => [index('debt_installments_due_idx').on(t.dueDate), index('debt_installments_debt_idx').on(t.debtId)],
);

export const personalMonths = pgTable('personal_months', {
  id: uuid('id').primaryKey().defaultRandom(),
  month: text('month').notNull().unique(),
  withdrawal: money('withdrawal').notNull().default('0'),
  ...stamps,
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('audit_created_idx').on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
