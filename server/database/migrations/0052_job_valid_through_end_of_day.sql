-- Legacy dashboard date controls stored valid-through dates at UTC midnight.
-- Preserve the recruiter-selected calendar day before public expiration is enforced.
UPDATE "job"
SET "valid_through" = "valid_through" + INTERVAL '1 day' - INTERVAL '1 millisecond'
WHERE "valid_through" IS NOT NULL
  AND "valid_through"::time = TIME '00:00:00';
