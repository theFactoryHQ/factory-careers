UPDATE "sso_provider"
SET "oidc_config" = jsonb_set(
  "oidc_config"::jsonb,
  '{scopes}',
  ("oidc_config"::jsonb->'scopes') || '["User.Read"]'::jsonb
)::text
WHERE "oidc_config" IS NOT NULL
  AND ("issuer" ILIKE 'https://login.microsoftonline.com/%' OR "issuer" ILIKE 'https://sts.windows.net/%')
  AND jsonb_typeof("oidc_config"::jsonb->'scopes') = 'array'
  AND NOT (("oidc_config"::jsonb->'scopes') ? 'User.Read');
