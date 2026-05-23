ALTER TYPE "public"."calendar_provider" ADD VALUE 'microsoft';--> statement-breakpoint
CREATE TABLE "interview_calendar_event" (
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
);
--> statement-breakpoint
ALTER TABLE "calendar_integration" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_integration" ALTER COLUMN "access_token_encrypted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_integration" ALTER COLUMN "refresh_token_encrypted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_integration" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview" ADD COLUMN "calendar_event_provider" "calendar_provider";--> statement-breakpoint
ALTER TABLE "interview_calendar_event" ADD CONSTRAINT "interview_calendar_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_calendar_event" ADD CONSTRAINT "interview_calendar_event_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_calendar_event_org_idx" ON "interview_calendar_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_calendar_event_interview_idx" ON "interview_calendar_event" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "interview_calendar_event_event_idx" ON "interview_calendar_event" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_calendar_event_destination_idx" ON "interview_calendar_event" USING btree ("interview_id","provider","destination_type","destination_email");--> statement-breakpoint
ALTER TABLE "calendar_integration" ADD CONSTRAINT "calendar_integration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_integration_org_provider_idx" ON "calendar_integration" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "calendar_integration_organization_id_idx" ON "calendar_integration" USING btree ("organization_id");