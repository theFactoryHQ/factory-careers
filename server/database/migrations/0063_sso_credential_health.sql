CREATE TABLE "sso_provider_credential_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"sso_provider_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"credential_key_id" text NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_successful_probe_at" timestamp with time zone,
	"last_probed_at" timestamp with time zone,
	"last_alerted_at" timestamp with time zone,
	"last_probe_status" text,
	"consecutive_transient_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_provider_credential_metadata_failures_check" CHECK ("consecutive_transient_failures" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sso_provider_credential_metadata" ADD CONSTRAINT "sso_provider_credential_metadata_sso_provider_id_sso_provider_id_fk" FOREIGN KEY ("sso_provider_id") REFERENCES "public"."sso_provider"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sso_provider_credential_metadata" ADD CONSTRAINT "sso_provider_credential_metadata_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_credential_metadata_provider_id_idx" ON "sso_provider_credential_metadata" USING btree ("sso_provider_id");
--> statement-breakpoint
CREATE INDEX "sso_provider_credential_metadata_organization_id_idx" ON "sso_provider_credential_metadata" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "sso_provider_credential_metadata_expires_at_idx" ON "sso_provider_credential_metadata" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "sso_provider_credential_metadata" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access" ON "sso_provider_credential_metadata" FOR ALL USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])) WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
