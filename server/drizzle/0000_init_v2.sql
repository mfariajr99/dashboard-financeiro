CREATE TYPE "expense_status" AS ENUM('PENDENTE', 'PAGA');--> statement-breakpoint
CREATE TYPE "opportunity_status" AS ENUM('ABERTA', 'VENDA_EFETUADA', 'DECLINOU');--> statement-breakpoint
CREATE TYPE "payment_method" AS ENUM('PIX', 'BOLETO', 'CARTAO');--> statement-breakpoint
CREATE TYPE "receivable_status" AS ENUM('A_RECEBER', 'RECEBIDO');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
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
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"sales_goal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"billing_goal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client" text NOT NULL,
	"description" text,
	"gross_amount" numeric(14, 2) NOT NULL,
	"month" text NOT NULL,
	"expected_date" date,
	"owner" text,
	"status" "opportunity_status" DEFAULT 'ABERTA' NOT NULL,
	"postponed_count" integer DEFAULT 0 NOT NULL,
	"original_month" text NOT NULL,
	"sale_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid,
	"client" text NOT NULL,
	"description" text,
	"payment_method" "payment_method" NOT NULL,
	"installment_number" integer DEFAULT 1 NOT NULL,
	"installment_count" integer DEFAULT 1 NOT NULL,
	"gross_amount" numeric(14, 2) NOT NULL,
	"fee_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"due_date" date NOT NULL,
	"status" "receivable_status" DEFAULT 'A_RECEBER' NOT NULL,
	"received_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid,
	"client" text NOT NULL,
	"description" text,
	"gross_amount" numeric(14, 2) NOT NULL,
	"sale_date" date NOT NULL,
	"month" text NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"fee_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"fee_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "expenses_due_idx" ON "expenses" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "expenses_series_idx" ON "expenses" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "opportunities_month_idx" ON "opportunities" USING btree ("month","status");--> statement-breakpoint
CREATE INDEX "receivables_due_idx" ON "receivables" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "receivables_sale_idx" ON "receivables" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_month_idx" ON "sales" USING btree ("month");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_opportunity_uq" ON "sales" USING btree ("opportunity_id") WHERE opportunity_id is not null;