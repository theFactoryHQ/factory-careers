WITH factory_org AS (
  SELECT "id"
  FROM "organization"
  WHERE "id" = 'factory-org'
     OR "slug" = 'factory'
  LIMIT 1
)
INSERT INTO "org_settings" (
  "id",
  "organization_id",
  "analysis_context"
)
SELECT
  'factory-org-settings-' || "id",
  "id",
  'Factory is a multifamily office for athletes, entertainers, and founders. Factory provides advisory services and business management to help clients manage their lives, with additional offerings across private investment, media, entertainment, and brand work. Candidate analysis should consider relevance to this high-touch client-services business and its client base, in addition to the specific role requirements.'
FROM factory_org
ON CONFLICT ("organization_id") DO UPDATE
SET
  "analysis_context" = CASE
    WHEN btrim(COALESCE("org_settings"."analysis_context", '')) = '' THEN EXCLUDED."analysis_context"
    ELSE "org_settings"."analysis_context"
  END,
  "updated_at" = CASE
    WHEN btrim(COALESCE("org_settings"."analysis_context", '')) = '' THEN now()
    ELSE "org_settings"."updated_at"
  END;
