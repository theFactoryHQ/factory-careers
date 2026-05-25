-- Migration: Add voluntary application compliance self-identification responses
-- ───────────────────────────────────────────────────────────────────────────

CREATE TYPE "compliance_sex" AS ENUM('male', 'female', 'prefer_not_to_answer');
--> statement-breakpoint
CREATE TYPE "compliance_race_ethnicity" AS ENUM(
  'hispanic_or_latino',
  'white',
  'black_or_african_american',
  'asian',
  'native_hawaiian_or_pacific_islander',
  'american_indian_or_alaska_native',
  'two_or_more_races',
  'prefer_not_to_answer'
);
--> statement-breakpoint
CREATE TYPE "compliance_veteran_status" AS ENUM('protected_veteran', 'not_protected_veteran', 'prefer_not_to_answer');
--> statement-breakpoint
CREATE TYPE "compliance_disability_status" AS ENUM('yes', 'no', 'prefer_not_to_answer');
--> statement-breakpoint

ALTER TABLE "job" ADD COLUMN "application_compliance_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "include_eeo" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "include_veteran" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "include_disability" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE "org_settings" ADD COLUMN "application_compliance_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "include_eeo" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "include_veteran" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "include_disability" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

CREATE TABLE "application_compliance_response" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "application_id" text NOT NULL,
  "candidate_id" text NOT NULL,
  "sex" "compliance_sex",
  "race_ethnicity" "compliance_race_ethnicity",
  "veteran_status" "compliance_veteran_status",
  "disability_status" "compliance_disability_status",
  "jurisdiction" text NOT NULL DEFAULT 'US',
  "form_version" text NOT NULL,
  "submitted_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "application_compliance_response" ADD CONSTRAINT "application_compliance_response_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_compliance_response" ADD CONSTRAINT "application_compliance_response_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_compliance_response" ADD CONSTRAINT "application_compliance_response_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "application_compliance_response_org_idx" ON "application_compliance_response" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "application_compliance_response_candidate_idx" ON "application_compliance_response" USING btree ("candidate_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_compliance_response_application_idx" ON "application_compliance_response" USING btree ("application_id");
