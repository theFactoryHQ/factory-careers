-- Better Auth 1.7 looks up device codes by device_code and user_code.
-- Keep the newest row when a duplicate exists so the unique indexes can be created.
DELETE FROM "device_code" AS older
USING "device_code" AS newer
WHERE older."device_code" = newer."device_code"
  AND (
    older."expires_at" < newer."expires_at"
    OR (
      older."expires_at" = newer."expires_at"
      AND older."id" < newer."id"
    )
  );
--> statement-breakpoint
DELETE FROM "device_code" AS older
USING "device_code" AS newer
WHERE older."user_code" = newer."user_code"
  AND (
    older."expires_at" < newer."expires_at"
    OR (
      older."expires_at" = newer."expires_at"
      AND older."id" < newer."id"
    )
  );
--> statement-breakpoint
-- SSO provider IDs are global callback keys. Refuse to hide a collision.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "sso_provider"
    GROUP BY "provider_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'sso_provider.provider_id has duplicates; resolve them before the Better Auth 1.7 unique index';
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX "device_code_device_code_idx";--> statement-breakpoint
DROP INDEX "device_code_user_code_idx";--> statement-breakpoint
DROP INDEX "sso_provider_provider_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_device_code_idx" ON "device_code" USING btree ("device_code");--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_user_code_idx" ON "device_code" USING btree ("user_code");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_provider_id_idx" ON "sso_provider" USING btree ("provider_id");
