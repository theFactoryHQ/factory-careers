DO $$ BEGIN
  CREATE TYPE "scoring_feedback_sentiment" AS ENUM ('up', 'down');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "analysis_run_criterion_score" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "analysis_run_id" text NOT NULL,
  "application_id" text NOT NULL,
  "criterion_key" text NOT NULL,
  "max_score" integer NOT NULL,
  "applicant_score" integer NOT NULL,
  "confidence" integer NOT NULL,
  "evidence" text NOT NULL,
  "strengths" jsonb,
  "gaps" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "analysis_run_feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "analysis_run_id" text NOT NULL,
  "application_id" text NOT NULL,
  "sentiment" "scoring_feedback_sentiment" NOT NULL,
  "comment" text,
  "created_by_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "analysis_run_criterion_score" ADD CONSTRAINT "analysis_run_criterion_score_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "analysis_run_criterion_score" ADD CONSTRAINT "analysis_run_criterion_score_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "analysis_run_criterion_score" ADD CONSTRAINT "analysis_run_criterion_score_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "analysis_run_feedback" ADD CONSTRAINT "analysis_run_feedback_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "analysis_run_feedback" ADD CONSTRAINT "analysis_run_feedback_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "analysis_run_feedback" ADD CONSTRAINT "analysis_run_feedback_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "analysis_run_feedback" ADD CONSTRAINT "analysis_run_feedback_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "analysis_run_criterion_score_org_idx" ON "analysis_run_criterion_score" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "analysis_run_criterion_score_run_idx" ON "analysis_run_criterion_score" USING btree ("analysis_run_id");
CREATE INDEX IF NOT EXISTS "analysis_run_criterion_score_application_idx" ON "analysis_run_criterion_score" USING btree ("application_id");
CREATE INDEX IF NOT EXISTS "analysis_run_feedback_org_idx" ON "analysis_run_feedback" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "analysis_run_feedback_run_idx" ON "analysis_run_feedback" USING btree ("analysis_run_id");
CREATE INDEX IF NOT EXISTS "analysis_run_feedback_application_idx" ON "analysis_run_feedback" USING btree ("application_id");
CREATE INDEX IF NOT EXISTS "analysis_run_feedback_created_by_idx" ON "analysis_run_feedback" USING btree ("created_by_id");
