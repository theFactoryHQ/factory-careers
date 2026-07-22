CREATE TYPE "public"."application_notification_cadence" AS ENUM('immediate', 'daily', 'weekly', 'monthly', 'off');
--> statement-breakpoint
CREATE TYPE "public"."application_notification_recipient_kind" AS ENUM('hiring_inbox', 'member');
--> statement-breakpoint
CREATE TABLE "application_notification_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"recipient_kind" "application_notification_recipient_kind" NOT NULL,
	"user_id" text,
	"recipient_email" text,
	"cadence" "application_notification_cadence" NOT NULL,
	"time_zone" text NOT NULL,
	"delivery_time" text DEFAULT '09:00' NOT NULL,
	"weekly_day" integer DEFAULT 1 NOT NULL,
	"monthly_day" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_notification_subscription_recipient_check" CHECK (
		("recipient_kind" = 'hiring_inbox' AND "user_id" IS NULL)
		OR ("recipient_kind" = 'member' AND "user_id" IS NOT NULL AND "recipient_email" IS NULL)
	),
	CONSTRAINT "application_notification_subscription_delivery_time_check" CHECK ("delivery_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "application_notification_subscription_weekly_day_check" CHECK ("weekly_day" BETWEEN 1 AND 7),
	CONSTRAINT "application_notification_subscription_monthly_day_check" CHECK ("monthly_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
CREATE TABLE "application_notification_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"status" "processing_task_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"result_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "application_notification_event_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "application_notification_event_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "application_notification_message" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"recipient_key" text NOT NULL,
	"recipient_kind" "application_notification_recipient_kind" NOT NULL,
	"user_id" text,
	"recipient_email" text NOT NULL,
	"cadence" "application_notification_cadence" NOT NULL,
	"time_zone" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "processing_task_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"provider_message_id" text,
	"result_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "application_notification_message_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "application_notification_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" text NOT NULL,
	"application_id" text NOT NULL,
	"message_id" text,
	"recipient_key" text NOT NULL,
	"recipient_kind" "application_notification_recipient_kind" NOT NULL,
	"user_id" text,
	"recipient_email" text NOT NULL,
	"cadence" "application_notification_cadence" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "processing_task_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "application_notification_subscription" ADD CONSTRAINT "application_notification_subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_subscription" ADD CONSTRAINT "application_notification_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_event" ADD CONSTRAINT "application_notification_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_event" ADD CONSTRAINT "application_notification_event_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_message" ADD CONSTRAINT "application_notification_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_message" ADD CONSTRAINT "application_notification_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_delivery" ADD CONSTRAINT "application_notification_delivery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_delivery" ADD CONSTRAINT "application_notification_delivery_event_id_application_notification_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."application_notification_event"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_delivery" ADD CONSTRAINT "application_notification_delivery_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_delivery" ADD CONSTRAINT "application_notification_delivery_message_id_application_notification_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."application_notification_message"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_notification_delivery" ADD CONSTRAINT "application_notification_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "application_notification_subscription_organization_id_idx" ON "application_notification_subscription" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "application_notification_subscription_user_id_idx" ON "application_notification_subscription" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_notification_subscription_inbox_unique_idx" ON "application_notification_subscription" USING btree ("organization_id") WHERE "recipient_kind" = 'hiring_inbox';
--> statement-breakpoint
CREATE UNIQUE INDEX "application_notification_subscription_member_unique_idx" ON "application_notification_subscription" USING btree ("organization_id", "user_id") WHERE "recipient_kind" = 'member';
--> statement-breakpoint
CREATE INDEX "application_notification_event_organization_id_idx" ON "application_notification_event" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_notification_event_application_id_idx" ON "application_notification_event" USING btree ("application_id");
--> statement-breakpoint
CREATE INDEX "application_notification_event_runnable_idx" ON "application_notification_event" USING btree ("status", "available_at") WHERE "status" IN ('pending', 'processing');
--> statement-breakpoint
CREATE INDEX "application_notification_message_organization_id_idx" ON "application_notification_message" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "application_notification_message_user_id_idx" ON "application_notification_message" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_notification_message_dedupe_key_idx" ON "application_notification_message" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "application_notification_message_runnable_idx" ON "application_notification_message" USING btree ("status", "available_at") WHERE "status" IN ('pending', 'processing');
--> statement-breakpoint
CREATE INDEX "application_notification_delivery_organization_id_idx" ON "application_notification_delivery" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "application_notification_delivery_event_id_idx" ON "application_notification_delivery" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "application_notification_delivery_application_id_idx" ON "application_notification_delivery" USING btree ("application_id");
--> statement-breakpoint
CREATE INDEX "application_notification_delivery_message_id_idx" ON "application_notification_delivery" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX "application_notification_delivery_user_id_idx" ON "application_notification_delivery" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_notification_delivery_event_recipient_unique_idx" ON "application_notification_delivery" USING btree ("event_id", "recipient_key");
--> statement-breakpoint
CREATE INDEX "application_notification_delivery_due_idx" ON "application_notification_delivery" USING btree ("status", "scheduled_for") WHERE "status" = 'pending';
--> statement-breakpoint
ALTER TABLE "application_notification_subscription" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access" ON "application_notification_subscription" FOR ALL USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])) WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
--> statement-breakpoint
ALTER TABLE "application_notification_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access" ON "application_notification_event" FOR ALL USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])) WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
--> statement-breakpoint
ALTER TABLE "application_notification_delivery" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access" ON "application_notification_delivery" FOR ALL USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])) WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
--> statement-breakpoint
ALTER TABLE "application_notification_message" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access" ON "application_notification_message" FOR ALL USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated'])) WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enqueue_application_notification_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	INSERT INTO public.application_notification_event (
		id,
		organization_id,
		application_id,
		status,
		available_at,
		created_at,
		updated_at
	) VALUES (
		'application-notification:' || NEW.id,
		NEW.organization_id,
		NEW.id,
		'pending',
		now(),
		now(),
		now()
	)
	ON CONFLICT (application_id) DO NOTHING;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER application_notification_application_inserted
AFTER INSERT ON "application"
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_application_notification_event();
