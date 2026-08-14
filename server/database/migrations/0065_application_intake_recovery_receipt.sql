ALTER TABLE "application" ADD COLUMN "recovery_receipt_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "application_recovery_receipt_id_idx"
  ON "application" USING btree ("recovery_receipt_id")
  WHERE "recovery_receipt_id" IS NOT NULL;
