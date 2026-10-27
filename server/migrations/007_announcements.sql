CREATE TABLE announcements (
 id text PRIMARY KEY,
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 10000),
 status text NOT NULL CHECK(status IN ('draft','published')),
 "publishedAt" timestamptz,
 "createdAt" timestamptz NOT NULL,
 "updatedAt" timestamptz NOT NULL,
 CHECK(status <> 'published' OR "publishedAt" IS NOT NULL)
);
CREATE INDEX announcements_public_idx ON announcements("publishedAt" DESC, id DESC) WHERE status='published';
