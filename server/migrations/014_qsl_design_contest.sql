CREATE TABLE "contestEntries" (
 id text PRIMARY KEY,
 "eventKey" text NOT NULL CHECK ("eventKey" = 'qsl-design-2026-11'),
 "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "cardId" text REFERENCES cards(id) ON DELETE SET NULL,
 description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
 "contactEmail" text NOT NULL CHECK (char_length("contactEmail") BETWEEN 1 AND 120),
 status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
 "reviewReason" text CHECK (char_length("reviewReason") <= 200),
 "reviewedBy" text REFERENCES users(id) ON DELETE SET NULL,
 "reviewedAt" timestamptz,
 revision integer NOT NULL CHECK (revision >= 1),
 "createdAt" timestamptz NOT NULL,
 "updatedAt" timestamptz NOT NULL,
 UNIQUE ("eventKey", "userId"),
 CHECK (status <> 'rejected' OR ("reviewReason" IS NOT NULL AND char_length("reviewReason") >= 1))
);
CREATE INDEX contest_entries_card_idx ON "contestEntries" ("cardId");
CREATE INDEX contest_entries_status_idx ON "contestEntries" ("eventKey", status, "updatedAt" DESC);
ALTER TABLE announcements ADD COLUMN "eventKey" text CHECK ("eventKey" IS NULL OR "eventKey" = 'qsl-design-2026-11');
CREATE INDEX announcements_event_idx ON announcements ("eventKey", "publishedAt" DESC, id DESC);
