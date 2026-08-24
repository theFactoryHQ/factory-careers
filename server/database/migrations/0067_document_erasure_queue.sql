CREATE TYPE "public"."document_erasure_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "document_erasure_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"privacy_request_id" text,
	"storage_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "document_erasure_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"result_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "document_erasure_queue_storage_key_check" CHECK (length("document_erasure_queue"."storage_key") > 0),
	CONSTRAINT "document_erasure_queue_dedupe_key_check" CHECK (length("document_erasure_queue"."dedupe_key") > 0),
	CONSTRAINT "document_erasure_queue_attempts_check" CHECK (
    "document_erasure_queue"."attempt_count" >= 0
    AND "document_erasure_queue"."max_attempts" > 0
    AND "document_erasure_queue"."attempt_count" <= "document_erasure_queue"."max_attempts"
  ),
	CONSTRAINT "document_erasure_queue_state_check" CHECK (
    ("document_erasure_queue"."status" = 'pending' AND "document_erasure_queue"."lease_expires_at" IS NULL AND "document_erasure_queue"."completed_at" IS NULL)
    OR ("document_erasure_queue"."status" = 'processing' AND "document_erasure_queue"."lease_expires_at" IS NOT NULL AND "document_erasure_queue"."completed_at" IS NULL)
    OR ("document_erasure_queue"."status" IN ('completed', 'failed') AND "document_erasure_queue"."lease_expires_at" IS NULL AND "document_erasure_queue"."completed_at" IS NOT NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "document_erasure_queue" ADD CONSTRAINT "document_erasure_queue_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_erasure_queue" ADD CONSTRAINT "document_erasure_queue_privacy_request_id_privacy_request_id_fk" FOREIGN KEY ("privacy_request_id") REFERENCES "public"."privacy_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_erasure_queue_organization_id_idx" ON "document_erasure_queue" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_erasure_queue_privacy_request_id_idx" ON "document_erasure_queue" USING btree ("privacy_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_erasure_queue_dedupe_key_idx" ON "document_erasure_queue" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "document_erasure_queue_runnable_idx" ON "document_erasure_queue" USING btree ("status","available_at") WHERE "document_erasure_queue"."status" IN ('pending', 'processing');--> statement-breakpoint
ALTER TABLE "document_erasure_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access" ON "document_erasure_queue" FOR ALL USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])) WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_document_erasure_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
    OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'document erasure identity is immutable';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER document_erasure_identity_immutable
BEFORE UPDATE ON "document_erasure_queue"
FOR EACH ROW
EXECUTE FUNCTION public.protect_document_erasure_identity();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enqueue_document_erasure_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tombstone_dedupe_key text := 'document-erasure:' || md5(OLD.storage_key);
  tombstone_organization_id text;
BEGIN
  SELECT id INTO tombstone_organization_id
  FROM public.organization
  WHERE id = OLD.organization_id;

  INSERT INTO public.document_erasure_queue (
    id,
    organization_id,
    storage_key,
    dedupe_key,
    available_at
  ) VALUES (
    tombstone_dedupe_key,
    tombstone_organization_id,
    OLD.storage_key,
    tombstone_dedupe_key,
    now()
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER document_enqueue_erasure_after_delete
AFTER DELETE ON "document"
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_document_erasure_after_delete();
