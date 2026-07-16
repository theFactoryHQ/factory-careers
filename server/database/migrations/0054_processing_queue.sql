SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."document_upload_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."processing_task_type" AS ENUM('application_analysis', 'document_parse', 'document_upload_reconciliation');--> statement-breakpoint
CREATE TYPE "public"."processing_task_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "processing_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "processing_task_type" NOT NULL,
	"status" "processing_task_status" DEFAULT 'pending' NOT NULL,
	"total_tasks" integer DEFAULT 0 NOT NULL,
	"completed_tasks" integer DEFAULT 0 NOT NULL,
	"failed_tasks" integer DEFAULT 0 NOT NULL,
	"cancelled_tasks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"sealed_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "processing_batch_id_organization_unique" UNIQUE("id","organization_id")
);--> statement-breakpoint
CREATE TABLE "processing_task" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "processing_task_type" NOT NULL,
	"resource_id" text NOT NULL,
	"status" "processing_task_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp,
	"result_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "processing_task_id_organization_unique" UNIQUE("id","organization_id")
);--> statement-breakpoint
CREATE TABLE "processing_batch_item" (
	"organization_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"task_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "processing_batch_item_org_batch_resource_pk" PRIMARY KEY("organization_id","batch_id","resource_id")
);--> statement-breakpoint
ALTER TABLE "processing_batch" ADD CONSTRAINT "processing_batch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "processing_task" ADD CONSTRAINT "processing_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "processing_batch_item" ADD CONSTRAINT "processing_batch_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "processing_batch_item" ADD CONSTRAINT "processing_batch_item_batch_org_fk" FOREIGN KEY ("batch_id","organization_id") REFERENCES "public"."processing_batch"("id","organization_id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "processing_batch_item" ADD CONSTRAINT "processing_batch_item_task_org_fk" FOREIGN KEY ("task_id","organization_id") REFERENCES "public"."processing_task"("id","organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "upload_status" "document_upload_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
-- Every row that predates upload reservations represents an upload that was
-- already accepted. A NULL parse is parse work, never evidence of an
-- interrupted upload, so legacy rows cannot enter destructive reconciliation.
UPDATE "document"
SET "upload_status" = 'completed';--> statement-breakpoint
INSERT INTO "processing_batch" (
	"id",
	"organization_id",
	"type",
	"status",
	"total_tasks",
	"sealed_at",
	"created_at",
	"updated_at"
)
SELECT
	'migration-document-parse:' || "organization_id",
	"organization_id",
	'document_parse',
	'pending',
	count(*)::integer,
	now(),
	now(),
	now()
FROM "document"
WHERE "parsed_content" IS NULL
GROUP BY "organization_id";--> statement-breakpoint
INSERT INTO "processing_task" (
	"id",
	"organization_id",
	"type",
	"resource_id",
	"status",
	"attempt_count",
	"max_attempts",
	"available_at",
	"created_at",
	"updated_at"
)
SELECT
	'migration-document-parse-task:' || "id",
	"organization_id",
	'document_parse',
	"id",
	'pending',
	0,
	5,
	now(),
	now(),
	now()
FROM "document"
WHERE "parsed_content" IS NULL;--> statement-breakpoint
INSERT INTO "processing_batch_item" (
	"organization_id",
	"batch_id",
	"resource_id",
	"task_id",
	"created_at"
)
SELECT
	"organization_id",
	'migration-document-parse:' || "organization_id",
	"id",
	'migration-document-parse-task:' || "id",
	now()
FROM "document"
WHERE "parsed_content" IS NULL;--> statement-breakpoint
CREATE INDEX "processing_batch_organization_id_idx" ON "processing_batch" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "processing_batch_org_status_idx" ON "processing_batch" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "processing_task_organization_id_idx" ON "processing_task" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "processing_task_claim_idx" ON "processing_task" USING btree ("organization_id","status","available_at");--> statement-breakpoint
CREATE INDEX "processing_task_lease_idx" ON "processing_task" USING btree ("organization_id","status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "processing_task_runnable_idx" ON "processing_task" USING btree ("status","available_at","organization_id");--> statement-breakpoint
CREATE INDEX "processing_task_expired_lease_idx" ON "processing_task" USING btree ("status","lease_expires_at","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_task_active_resource_idx" ON "processing_task" USING btree ("organization_id","type","resource_id") WHERE "status" IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "processing_batch_item_task_idx" ON "processing_batch_item" USING btree ("organization_id","task_id");--> statement-breakpoint
CREATE INDEX "processing_batch_item_batch_idx" ON "processing_batch_item" USING btree ("organization_id","batch_id");
