ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "active_from" timestamp;
UPDATE "job" SET "active_from" = "created_at" WHERE "active_from" IS NULL;
ALTER TABLE "job" ALTER COLUMN "active_from" SET DEFAULT now();
ALTER TABLE "job" ALTER COLUMN "active_from" SET NOT NULL;
