ALTER TABLE "receivables" ADD COLUMN "series_id" text;--> statement-breakpoint
CREATE INDEX "receivables_series_idx" ON "receivables" USING btree ("series_id");