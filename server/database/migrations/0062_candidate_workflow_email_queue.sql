CREATE TABLE "candidate_workflow_email_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"job_id" text NOT NULL,
	"purpose" "email_template_purpose" NOT NULL,
	"recipient_email" text NOT NULL,
	"template_id" text NOT NULL,
	"template_subject" text NOT NULL,
	"template_body" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "processing_task_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"provider_message_id" text,
	"result_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "candidate_workflow_email_queue_purpose_check" CHECK ("purpose" IN ('application_acknowledgement', 'application_rejection')),
	CONSTRAINT "candidate_workflow_email_queue_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "candidate_workflow_email_queue" ADD CONSTRAINT "candidate_workflow_email_queue_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidate_workflow_email_queue" ADD CONSTRAINT "candidate_workflow_email_queue_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidate_workflow_email_queue" ADD CONSTRAINT "candidate_workflow_email_queue_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidate_workflow_email_queue" ADD CONSTRAINT "candidate_workflow_email_queue_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "candidate_workflow_email_queue_organization_id_idx" ON "candidate_workflow_email_queue" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "candidate_workflow_email_queue_application_id_idx" ON "candidate_workflow_email_queue" USING btree ("application_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_workflow_email_queue_dedupe_key_idx" ON "candidate_workflow_email_queue" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "candidate_workflow_email_queue_runnable_idx" ON "candidate_workflow_email_queue" USING btree ("status", "available_at") WHERE "status" IN ('pending', 'processing');
--> statement-breakpoint
ALTER TABLE "candidate_workflow_email_queue" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access" ON "candidate_workflow_email_queue" FOR ALL USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])) WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
