ALTER TABLE announcements ADD COLUMN "displaySeconds" integer NOT NULL DEFAULT 30
 CHECK ("displaySeconds" BETWEEN 1 AND 3600);

CREATE TABLE "announcementDismissals" (
 id text PRIMARY KEY,
 "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "announcementId" text NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL,
 UNIQUE ("userId", "announcementId")
);
