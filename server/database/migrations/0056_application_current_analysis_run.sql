SET LOCAL lock_timeout = '5s';

ALTER TABLE "application" ADD COLUMN "current_analysis_run_id" text;

WITH ranked_runs AS (
  SELECT
    application.id AS application_id,
    analysis_run.id AS analysis_run_id,
    row_number() OVER (
      PARTITION BY application.organization_id, application.id
      ORDER BY analysis_run.created_at DESC, analysis_run.id DESC
    ) AS run_rank
  FROM application
  INNER JOIN analysis_run
    ON analysis_run.organization_id = application.organization_id
    AND analysis_run.application_id = application.id
    AND analysis_run.status = 'completed'
    AND analysis_run.composite_score IS NOT DISTINCT FROM application.score
)
UPDATE application
SET current_analysis_run_id = ranked_runs.analysis_run_id
FROM ranked_runs
WHERE application.id = ranked_runs.application_id
  AND ranked_runs.run_rank = 1;

-- Older completed runs predate immutable criterion snapshots. Copy the live
-- criterion rows only for the run selected above, preserving one coherent
-- generation for score-display and feedback reads after this migration.
INSERT INTO analysis_run_criterion_score (
  id,
  organization_id,
  analysis_run_id,
  application_id,
  criterion_key,
  max_score,
  applicant_score,
  confidence,
  evidence,
  strengths,
  gaps,
  created_at
)
SELECT
  'legacy_' || md5(
    application.organization_id || ':' || application.id || ':' ||
    application.current_analysis_run_id || ':' || criterion_score.criterion_key
  ),
  application.organization_id,
  application.current_analysis_run_id,
  application.id,
  criterion_score.criterion_key,
  criterion_score.max_score,
  criterion_score.applicant_score,
  criterion_score.confidence,
  criterion_score.evidence,
  criterion_score.strengths,
  criterion_score.gaps,
  criterion_score.created_at
FROM application
INNER JOIN criterion_score
  ON criterion_score.organization_id = application.organization_id
  AND criterion_score.application_id = application.id
WHERE application.current_analysis_run_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM analysis_run_criterion_score
    WHERE analysis_run_criterion_score.organization_id = application.organization_id
      AND analysis_run_criterion_score.application_id = application.id
      AND analysis_run_criterion_score.analysis_run_id = application.current_analysis_run_id
  )
ON CONFLICT (id) DO NOTHING;

CREATE INDEX "application_current_analysis_run_id_idx"
  ON "application" USING btree ("current_analysis_run_id");

ALTER TABLE "analysis_run"
  ADD CONSTRAINT "analysis_run_org_application_id_unique"
  UNIQUE ("organization_id", "application_id", "id");

ALTER TABLE "application"
  ADD CONSTRAINT "application_current_analysis_run_id_analysis_run_id_fk"
  FOREIGN KEY ("organization_id", "id", "current_analysis_run_id")
  REFERENCES "public"."analysis_run"("organization_id", "application_id", "id")
  ON DELETE SET NULL ("current_analysis_run_id")
  ON UPDATE no action
  NOT VALID;

ALTER TABLE "application"
  VALIDATE CONSTRAINT "application_current_analysis_run_id_analysis_run_id_fk";
