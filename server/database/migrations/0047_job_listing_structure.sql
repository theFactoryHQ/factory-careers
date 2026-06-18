ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "divisions" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "description_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;
CREATE INDEX IF NOT EXISTS "job_divisions_gin_idx" ON "job" USING gin ("divisions");
