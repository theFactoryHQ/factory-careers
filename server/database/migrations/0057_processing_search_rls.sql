-- Keep internal recruiter-search and durable-processing data unavailable to
-- Supabase client roles while preserving direct server-role access.
ALTER TABLE "application_search_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access"
  ON "application_search_document"
  FOR ALL
  TO PUBLIC
  USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']))
  WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));--> statement-breakpoint

ALTER TABLE "application_search_refresh_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access"
  ON "application_search_refresh_queue"
  FOR ALL
  TO PUBLIC
  USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']))
  WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));--> statement-breakpoint

ALTER TABLE "processing_batch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access"
  ON "processing_batch"
  FOR ALL
  TO PUBLIC
  USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']))
  WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));--> statement-breakpoint

ALTER TABLE "processing_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access"
  ON "processing_task"
  FOR ALL
  TO PUBLIC
  USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']))
  WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));--> statement-breakpoint

ALTER TABLE "processing_batch_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_careers_server_roles_full_access"
  ON "processing_batch_item"
  FOR ALL
  TO PUBLIC
  USING (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']))
  WITH CHECK (CURRENT_USER <> ALL (ARRAY['anon', 'authenticated']));
