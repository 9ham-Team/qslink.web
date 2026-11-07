CREATE TABLE "contestVotingSettings" (
 id text PRIMARY KEY CHECK (id = 'qsl-design-2026-11'),
 "startsAt" timestamptz,
 "endsAt" timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
 CHECK (("startsAt" IS NULL AND "endsAt" IS NULL) OR
   ("startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "startsAt" < "endsAt"))
);

INSERT INTO app_meta (key, value)
VALUES ('contestVotingSecret', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE "contestVotes" (
 id text PRIMARY KEY,
 "eventKey" text NOT NULL CHECK ("eventKey" = 'qsl-design-2026-11'),
 "workId" text NOT NULL REFERENCES "contestWorks"(id),
 "userId" text REFERENCES users(id) ON DELETE SET NULL,
 "voterKey" text NOT NULL CHECK ("voterKey" ~ '^[a-f0-9]{64}$'),
 "voteDate" date NOT NULL,
 slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
 "createdAt" timestamptz NOT NULL,
 "fingerprintHash" text CHECK ("fingerprintHash" ~ '^[a-f0-9]{64}$'),
 "fingerprintExpiresAt" timestamptz NOT NULL,
 UNIQUE ("eventKey", "voterKey", "voteDate"),
 UNIQUE ("eventKey", "voterKey", "workId"),
 UNIQUE ("eventKey", "voterKey", slot),
 CHECK ("voteDate" = ("createdAt" AT TIME ZONE 'Asia/Shanghai')::date)
);
CREATE INDEX contest_votes_work_idx ON "contestVotes" ("eventKey", "workId");
CREATE INDEX contest_votes_expiry_idx ON "contestVotes" ("fingerprintExpiresAt") WHERE "fingerprintHash" IS NOT NULL;
