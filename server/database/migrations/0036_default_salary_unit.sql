ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "default_salary_unit" text DEFAULT 'YEAR' NOT NULL;
