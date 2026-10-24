CREATE TABLE app_meta (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE users (
 id text PRIMARY KEY, username text NOT NULL CHECK(length(username) BETWEEN 3 AND 20), email text NOT NULL,
 "displayName" text NOT NULL, "callSign" text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '', "avatarColor" text NOT NULL,
 role text NOT NULL CHECK(role IN ('user','admin')), status text NOT NULL CHECK(status IN ('active','banned')),
 address jsonb, "passwordHash" text NOT NULL,
 "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
);
CREATE UNIQUE INDEX users_username_unique ON users(lower(username));
CREATE UNIQUE INDEX users_email_unique ON users(lower(email));
CREATE TABLE cards (
 id text PRIMARY KEY, "ownerId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title text NOT NULL, "callSign" text NOT NULL DEFAULT '', band text NOT NULL DEFAULT '', mode text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
 ratio jsonb NOT NULL CHECK(jsonb_typeof(ratio)='object' AND (ratio->>'w')::int>0 AND (ratio->>'h')::int>0),
 "frontImage" text NOT NULL, "backImage" text NOT NULL DEFAULT '', "shareToken" text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('pending','approved','rejected')), "rejectReason" text,
 "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, UNIQUE(id,"ownerId")
);
CREATE INDEX cards_owner_idx ON cards("ownerId");
CREATE INDEX cards_public_idx ON cards(status,"createdAt" DESC);
CREATE TABLE exchanges (
 id text PRIMARY KEY, "cardId" text NOT NULL,
 "fromUserId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, "toUserId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled','completed')),
 message text NOT NULL DEFAULT '', "rejectReason" text, "contactName" text NOT NULL,
 "fromAddress" jsonb NOT NULL,
 "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, "decidedAt" timestamptz,
 CHECK("fromUserId"<>"toUserId"),
 FOREIGN KEY("cardId","toUserId") REFERENCES cards(id,"ownerId") ON DELETE CASCADE
);
CREATE UNIQUE INDEX exchanges_active_unique ON exchanges("cardId","fromUserId") WHERE status IN ('pending','approved');
CREATE UNIQUE INDEX exchanges_approved_unique ON exchanges("cardId") WHERE status='approved';
CREATE INDEX exchanges_incoming_idx ON exchanges("toUserId",status,"createdAt" DESC);
CREATE INDEX exchanges_outgoing_idx ON exchanges("fromUserId",status,"createdAt" DESC);
CREATE TABLE likes (
 id text PRIMARY KEY, "cardId" text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, "createdAt" timestamptz NOT NULL, UNIQUE("cardId","userId")
);
CREATE INDEX likes_user_idx ON likes("userId");
CREATE TABLE sessions (
 token text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL, "expiresAt" timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions("userId");
CREATE INDEX sessions_expiry_idx ON sessions("expiresAt");
