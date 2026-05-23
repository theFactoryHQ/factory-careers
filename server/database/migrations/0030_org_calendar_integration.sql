ALTER TABLE "calendar_integration" ADD COLUMN IF NOT EXISTS "organization_id" text REFERENCES "organization"("id") ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_integration_org_provider_idx" ON "calendar_integration" ("organization_id", "provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_integration_organization_id_idx" ON "calendar_integration" ("organization_id");
