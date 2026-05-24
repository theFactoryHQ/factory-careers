ALTER TABLE "candidate" ADD COLUMN IF NOT EXISTS "country" text;--> statement-breakpoint
ALTER TABLE "candidate" ADD COLUMN IF NOT EXISTS "state" text;
