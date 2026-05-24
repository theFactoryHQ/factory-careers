ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "signup_allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;
