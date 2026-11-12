-- Deliberately independent of mutable cards/works/users: deletion must not erase audit scores.
CREATE TABLE "contestJudging" (
  id text PRIMARY KEY,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  deadline timestamptz NOT NULL,
  "frozenAt" timestamptz,
  "materialVersion" text,
  "storageKey" text,
  CHECK (("frozenAt" IS NULL AND "materialVersion" IS NULL AND "storageKey" IS NULL) OR
         ("frozenAt" IS NOT NULL AND "materialVersion" IS NOT NULL AND "storageKey" IS NOT NULL))
);
CREATE TABLE "contestJudges" (
  "eventKey" text NOT NULL REFERENCES "contestJudging"(id),
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 5),
  "userId" text NOT NULL,
  username text NOT NULL,
  uid text,
  "displayName" text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  "submittedAt" timestamptz,
  PRIMARY KEY ("eventKey", slot), UNIQUE ("eventKey", "userId")
);
CREATE TABLE "contestMaterials" (
  "eventKey" text NOT NULL REFERENCES "contestJudging"(id),
  id text NOT NULL,
  number integer NOT NULL CHECK (number > 0),
  title text NOT NULL,
  description text NOT NULL,
  images jsonb NOT NULL,
  PRIMARY KEY ("eventKey", id), UNIQUE ("eventKey", number)
);
CREATE TABLE "contestScores" (
  "eventKey" text NOT NULL,
  "materialId" text NOT NULL,
  slot integer NOT NULL,
  value numeric(3,1) NOT NULL CHECK (value BETWEEN 0 AND 10),
  comment text NOT NULL CHECK (char_length(comment) <= 1000),
  revision integer NOT NULL CHECK (revision > 0),
  "updatedAt" timestamptz NOT NULL,
  PRIMARY KEY ("eventKey", "materialId", slot),
  FOREIGN KEY ("eventKey", "materialId") REFERENCES "contestMaterials"("eventKey",id),
  FOREIGN KEY ("eventKey", slot) REFERENCES "contestJudges"("eventKey",slot)
);
