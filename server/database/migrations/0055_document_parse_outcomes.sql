SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."document_parse_status" AS ENUM('pending', 'parsed', 'no_text', 'failed');--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "parse_status" "document_parse_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "parse_result_code" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "parse_retryable" boolean;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "parse_attempted_at" timestamp;--> statement-breakpoint
UPDATE "document"
SET "parse_status" = 'parsed'
WHERE "parsed_content" IS NOT NULL;
