ALTER TYPE "public"."calendar_provider" ADD VALUE IF NOT EXISTS 'microsoft';--> statement-breakpoint
ALTER TABLE "interview" ADD COLUMN IF NOT EXISTS "calendar_event_provider" "calendar_provider";
