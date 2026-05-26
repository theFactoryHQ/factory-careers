ALTER TABLE "org_settings"
  ADD COLUMN IF NOT EXISTS "scoring_bands" jsonb NOT NULL DEFAULT '[
    {"label":"Unlikely Fit","minScore":0,"maxScore":39,"color":"danger"},
    {"label":"Potential Fit","minScore":40,"maxScore":69,"color":"warning"},
    {"label":"Strong Fit","minScore":70,"maxScore":100,"color":"success"}
  ]'::jsonb;

ALTER TABLE "job"
  ADD COLUMN IF NOT EXISTS "scoring_bands" jsonb;
