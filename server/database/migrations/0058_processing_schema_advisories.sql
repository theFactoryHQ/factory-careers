-- Keep unqualified names inside the recruiter-search trigger functions bound to
-- trusted schemas rather than inheriting a caller-controlled search path.
ALTER FUNCTION public.refresh_application_search_document(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.queue_application_search_document(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.flush_application_search_document_queue() SET search_path = pg_catalog, public;
ALTER FUNCTION public.queue_application_search_for_candidate(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.queue_application_search_for_job(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.queue_application_search_for_entity(text, text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.queue_application_search_for_property_definition(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.queue_application_search_for_tracking_link(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.application_search_refresh_trigger() SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER TABLE "device_code" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access"
ON "device_code"
FOR ALL
USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']))
WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
--> statement-breakpoint
CREATE INDEX "processing_batch_item_batch_org_fk_idx"
ON "processing_batch_item" USING btree ("batch_id", "organization_id");
--> statement-breakpoint
CREATE INDEX "processing_batch_item_task_org_fk_idx"
ON "processing_batch_item" USING btree ("task_id", "organization_id");
