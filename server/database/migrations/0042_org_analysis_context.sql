ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "analysis_context" text DEFAULT '' NOT NULL;
