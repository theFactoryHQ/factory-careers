ALTER TABLE "document" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint
CREATE INDEX "document_application_id_idx" ON "document" USING btree ("application_id");
