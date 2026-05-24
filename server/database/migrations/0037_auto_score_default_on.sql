ALTER TABLE "job" ALTER COLUMN "auto_score_on_apply" SET DEFAULT true;

UPDATE "job" SET "auto_score_on_apply" = true;
