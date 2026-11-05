ALTER TABLE "contestEntries" ADD COLUMN "cardIds" jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE "contestEntries" SET "cardIds" = jsonb_build_array("cardId") WHERE "cardId" IS NOT NULL;
ALTER TABLE "contestEntries" DROP COLUMN "cardId";
ALTER TABLE "contestEntries" ADD CONSTRAINT contest_entries_cards_check
  CHECK (jsonb_typeof("cardIds") = 'array' AND jsonb_array_length("cardIds") <= 3);
