CREATE TABLE "contestWorks" (
 id text PRIMARY KEY,
 "eventKey" text NOT NULL CHECK ("eventKey" = 'qsl-design-2026-11'),
 "entryId" text REFERENCES "contestEntries"(id) ON DELETE SET NULL,
 "cardId" text REFERENCES cards(id) ON DELETE SET NULL,
 number integer NOT NULL CHECK (number > 0),
 description text NOT NULL,
 "submittedAt" timestamptz NOT NULL,
 active boolean NOT NULL,
 UNIQUE ("eventKey", number),
 UNIQUE ("eventKey", "cardId"),
 CHECK (("entryId" IS NOT NULL AND "cardId" IS NOT NULL AND char_length(description) BETWEEN 1 AND 2000)
   OR ("entryId" IS NULL AND "cardId" IS NULL AND description = '' AND NOT active))
);

INSERT INTO "contestWorks" (id, "eventKey", "entryId", "cardId", number, description, "submittedAt", active)
SELECT 'cw_legacy_' || e.id || '_' || selected.ordinality, e."eventKey", e.id, c.id,
 row_number() OVER (PARTITION BY e."eventKey" ORDER BY e."createdAt", e.id, selected.ordinality)::integer,
 e.description, e."createdAt", true
FROM "contestEntries" e
CROSS JOIN LATERAL jsonb_array_elements_text(e."cardIds") WITH ORDINALITY AS selected("cardId", ordinality)
JOIN cards c ON c.id = selected."cardId";

CREATE INDEX contest_works_entry_idx ON "contestWorks" ("entryId");
CREATE INDEX contest_works_public_idx ON "contestWorks" ("eventKey", "submittedAt", number) WHERE active;

CREATE FUNCTION scrub_contest_works() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE format('UPDATE %I."contestWorks" SET "entryId" = NULL, "cardId" = NULL, description = %L, active = false WHERE %I = $1',
   TG_TABLE_SCHEMA, '', CASE WHEN TG_TABLE_NAME = 'cards' THEN 'cardId' ELSE 'entryId' END)
 USING OLD.id;
 RETURN OLD;
END;
$$;
CREATE TRIGGER contest_works_card_delete BEFORE DELETE ON cards
 FOR EACH ROW EXECUTE FUNCTION scrub_contest_works();
CREATE TRIGGER contest_works_entry_delete BEFORE DELETE ON "contestEntries"
 FOR EACH ROW EXECUTE FUNCTION scrub_contest_works();

ALTER TABLE "contestEntries" DROP COLUMN "cardIds", DROP COLUMN description;
