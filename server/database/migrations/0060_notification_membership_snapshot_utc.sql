CREATE OR REPLACE FUNCTION public.enqueue_application_notification_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	subscription_snapshot jsonb;
BEGIN
	SELECT jsonb_build_object(
		'defaultTimeZone', COALESCE((
			SELECT settings.email_business_hours_timezone
			FROM public.org_settings AS settings
			WHERE settings.organization_id = NEW.organization_id
			LIMIT 1
		), 'America/New_York'),
		'inbox', (
			SELECT jsonb_build_object(
				'recipientEmail', subscription.recipient_email,
				'cadence', subscription.cadence,
				'timeZone', subscription.time_zone,
				'deliveryTime', subscription.delivery_time,
				'weeklyDay', subscription.weekly_day,
				'monthlyDay', subscription.monthly_day
			)
			FROM public.application_notification_subscription AS subscription
			WHERE subscription.organization_id = NEW.organization_id
				AND subscription.recipient_kind = 'hiring_inbox'
			LIMIT 1
		),
		'members', COALESCE((
			SELECT jsonb_agg(jsonb_build_object(
				'userId', subscription.user_id,
				'memberId', subscription.member_id,
				'recipientEmail', account.email,
				'membershipCreatedAt', membership.created_at AT TIME ZONE 'UTC',
				'cadence', subscription.cadence,
				'timeZone', subscription.time_zone,
				'deliveryTime', subscription.delivery_time,
				'weeklyDay', subscription.weekly_day,
				'monthlyDay', subscription.monthly_day
			) ORDER BY subscription.user_id)
			FROM public.application_notification_subscription AS subscription
			JOIN public.member AS membership
				ON membership.id = subscription.member_id
				AND membership.organization_id = subscription.organization_id
				AND membership.user_id = subscription.user_id
			JOIN public.user AS account ON account.id = subscription.user_id
			WHERE subscription.organization_id = NEW.organization_id
				AND subscription.recipient_kind = 'member'
				AND subscription.cadence <> 'off'
		), '[]'::jsonb)
	) INTO subscription_snapshot;

	INSERT INTO public.application_notification_event (
		id,
		organization_id,
		application_id,
		subscription_snapshot,
		status,
		available_at,
		created_at,
		updated_at
	) VALUES (
		'application-notification:' || NEW.id,
		NEW.organization_id,
		NEW.id,
		subscription_snapshot,
		'pending',
		now(),
		now(),
		now()
	)
	ON CONFLICT (application_id) DO NOTHING;

	RETURN NEW;
END;
$$;
