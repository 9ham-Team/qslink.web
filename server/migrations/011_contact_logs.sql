CREATE TABLE "contactLogs" (
 id text PRIMARY KEY,
 "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "dedupKey" text NOT NULL,
 "qsoAt" timestamptz NOT NULL,
 "callSign" text NOT NULL,
 details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
 "createdAt" timestamptz NOT NULL,
 "updatedAt" timestamptz NOT NULL,
 UNIQUE ("userId", "dedupKey")
);
CREATE INDEX contact_logs_user_time_idx ON "contactLogs" ("userId", "qsoAt" DESC);
