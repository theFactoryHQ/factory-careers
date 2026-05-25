CREATE TYPE "privacy_request_status" AS ENUM('submitted', 'verified', 'in_review', 'completed', 'denied', 'cancelled');--> statement-breakpoint
CREATE TABLE "privacy_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"status" "privacy_request_status" DEFAULT 'submitted' NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"state_of_residence" text NOT NULL,
	"job_slug" text,
	"application_id" text,
	"details" text,
	"verification_token_hash" text NOT NULL,
	"verification_sent_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	"reviewed_by_id" text,
	"reviewed_at" timestamp,
	"completed_by_id" text,
	"completed_at" timestamp,
	"resolution_notes" text,
	"denial_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_request_verification_token_hash_idx" UNIQUE("verification_token_hash")
);
--> statement-breakpoint
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_completed_by_id_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_request_organization_id_idx" ON "privacy_request" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "privacy_request_requester_email_idx" ON "privacy_request" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "privacy_request_status_idx" ON "privacy_request" USING btree ("status");
