CREATE TABLE "emailVerifications" (
  id text PRIMARY KEY,
  nonce text NOT NULL,
  "codeHash" text,
  attempts integer NOT NULL CHECK (attempts BETWEEN 0 AND 5),
  status text NOT NULL CHECK (status IN ('pending','ready','failed','consumed')),
  "sentAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL
);
CREATE TABLE "mailQuotas" (
  id text PRIMARY KEY,
  count integer NOT NULL CHECK (count >= 0),
  "windowAt" timestamptz NOT NULL
);
