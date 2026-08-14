DROP TRIGGER IF EXISTS application_notification_application_inserted ON public.application;
--> statement-breakpoint
CREATE TRIGGER application_notification_application_inserted
AFTER INSERT ON public.application
FOR EACH ROW
WHEN (current_setting('factory_careers.canary', true) IS DISTINCT FROM 'on')
EXECUTE FUNCTION public.enqueue_application_notification_event();
