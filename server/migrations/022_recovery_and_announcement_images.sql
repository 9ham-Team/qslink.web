ALTER TABLE "emailVerifications" ADD COLUMN "accountBinding" text;

CREATE TABLE "announcementImages" (
  id uuid PRIMARY KEY,
  content bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
