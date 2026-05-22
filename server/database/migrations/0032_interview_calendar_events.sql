CREATE TABLE IF NOT EXISTS "interview_calendar_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"interview_id" text NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"destination_type" text NOT NULL,
	"destination_email" text,
	"event_id" text,
	"event_link" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_calendar_event" ADD CONSTRAINT "interview_calendar_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_calendar_event" ADD CONSTRAINT "interview_calendar_event_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_calendar_event_org_idx" ON "interview_calendar_event" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_calendar_event_interview_idx" ON "interview_calendar_event" ("interview_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_calendar_event_event_idx" ON "interview_calendar_event" ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interview_calendar_event_destination_idx" ON "interview_calendar_event" ("interview_id","provider","destination_type","destination_email");
