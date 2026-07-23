DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "invite_link"
		WHERE octet_length("token") <> 64
			OR "token" !~ '^[0-9a-f]+$'
	) THEN
		RAISE EXCEPTION 'Cannot hash invite-link tokens: invalid legacy token format';
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "invite_link" ADD COLUMN "token_hash" text;
--> statement-breakpoint
UPDATE "invite_link"
SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
--> statement-breakpoint
ALTER TABLE "invite_link" ALTER COLUMN "token_hash" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "invite_link" DROP CONSTRAINT "invite_link_token_unique";
--> statement-breakpoint
DROP INDEX "invite_link_token_idx";
--> statement-breakpoint
ALTER TABLE "invite_link" DROP COLUMN "token";
--> statement-breakpoint
CREATE UNIQUE INDEX "invite_link_token_hash_idx" ON "invite_link" USING btree ("token_hash");
