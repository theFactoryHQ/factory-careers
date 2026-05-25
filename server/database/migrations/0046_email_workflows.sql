CREATE TYPE "public"."email_template_purpose" AS ENUM('interview_invitation', 'application_acknowledgement', 'application_rejection');--> statement-breakpoint
ALTER TABLE "email_template" ADD COLUMN IF NOT EXISTS "purpose" "email_template_purpose" DEFAULT 'interview_invitation' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "send_application_acknowledgement" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "application_acknowledgement_template_id" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "application_acknowledgement_delay_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "application_acknowledgement_business_hours_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "send_application_rejection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "application_rejection_template_id" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "application_rejection_delay_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "application_rejection_business_hours_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "interview_invitation_template_id" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "email_business_hours_timezone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "email_business_hours_start_hour" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "email_business_hours_end_hour" integer DEFAULT 17 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_template_purpose_idx" ON "email_template" USING btree ("organization_id","purpose");
