CREATE TABLE "funil_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funil_diagnosticos" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funil_propostas" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "funil_calls_updated_idx" ON "funil_calls" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "funil_diagnosticos_updated_idx" ON "funil_diagnosticos" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "funil_propostas_updated_idx" ON "funil_propostas" USING btree ("updated_at");