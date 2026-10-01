CREATE TABLE "debt_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"count" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"due_date" date NOT NULL,
	"status" "expense_status" DEFAULT 'PENDENTE' NOT NULL,
	"paid_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"creditor" text,
	"total_amount" numeric(14, 2) NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"due_day" integer NOT NULL,
	"start_month" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"supplier" text,
	"amount" numeric(14, 2) NOT NULL,
	"due_date" date NOT NULL,
	"status" "expense_status" DEFAULT 'PENDENTE' NOT NULL,
	"paid_date" date,
	"series_id" text,
	"series_index" integer,
	"series_count" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_months" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"withdrawal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_months_month_unique" UNIQUE("month")
);
--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_debt_id_personal_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "personal_debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_installments_due_idx" ON "debt_installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "debt_installments_debt_idx" ON "debt_installments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "personal_expenses_due_idx" ON "personal_expenses" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "personal_expenses_series_idx" ON "personal_expenses" USING btree ("series_id");