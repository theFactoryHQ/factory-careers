ALTER TABLE "calendar_integration" ADD COLUMN "connection_generation" text;

UPDATE "calendar_integration"
SET "connection_generation" = "id"
WHERE "connection_generation" IS NULL;

ALTER TABLE "calendar_integration"
ALTER COLUMN "connection_generation" SET NOT NULL;
