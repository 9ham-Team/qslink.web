-- Preserve replaced judges and their scores without including them in current results.
CREATE TABLE "contestJudgingChanges" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "eventKey" text NOT NULL REFERENCES "contestJudging"(id),
  "actorId" text NOT NULL,
  "changedAt" timestamptz NOT NULL DEFAULT now(),
  "previousConfig" jsonb NOT NULL,
  "previousJudges" jsonb NOT NULL,
  "previousScores" jsonb NOT NULL
);
CREATE INDEX contest_votes_fingerprint_idx ON "contestVotes" ("eventKey", "fingerprintHash") WHERE "fingerprintHash" IS NOT NULL;
