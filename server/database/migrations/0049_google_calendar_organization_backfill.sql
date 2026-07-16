WITH "single_membership" AS (
  SELECT
    "user_id",
    MIN("organization_id") AS "organization_id"
  FROM "member"
  GROUP BY "user_id"
  HAVING COUNT(*) = 1
),
"candidates" AS (
  SELECT
    "integration"."id",
    "membership"."organization_id",
    COUNT(*) OVER (PARTITION BY "membership"."organization_id") AS "organization_candidate_count"
  FROM "calendar_integration" AS "integration"
  INNER JOIN "single_membership" AS "membership"
    ON "membership"."user_id" = "integration"."user_id"
  WHERE "integration"."provider" = 'google'
    AND "integration"."organization_id" IS NULL
),
"safe_candidates" AS (
  SELECT "candidate"."id", "candidate"."organization_id"
  FROM "candidates" AS "candidate"
  WHERE "candidate"."organization_candidate_count" = 1
    AND NOT EXISTS (
      SELECT 1
      FROM "calendar_integration" AS "existing"
      WHERE "existing"."organization_id" = "candidate"."organization_id"
        AND "existing"."provider" = 'google'
    )
)
UPDATE "calendar_integration" AS "integration"
SET
  "organization_id" = "candidate"."organization_id",
  "updated_at" = NOW()
FROM "safe_candidates" AS "candidate"
WHERE "integration"."id" = "candidate"."id"
  AND "integration"."provider" = 'google'
  AND "integration"."organization_id" IS NULL;
