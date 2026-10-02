CREATE TABLE "funil_apresentacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "funil_apresentacoes_updated_idx" ON "funil_apresentacoes" USING btree ("updated_at");