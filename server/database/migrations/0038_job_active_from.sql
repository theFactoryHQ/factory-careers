ALTER TABLE "job" ADD COLUMN "active_from" timestamp;
UPDATE "job" SET "active_from" = "created_at";
ALTER TABLE "job" ALTER COLUMN "active_from" SET DEFAULT now();
ALTER TABLE "job" ALTER COLUMN "active_from" SET NOT NULL;
