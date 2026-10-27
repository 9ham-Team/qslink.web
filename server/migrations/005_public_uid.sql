ALTER TABLE users ADD COLUMN uid text;
CREATE UNIQUE INDEX users_uid_unique ON users(uid);
DO $$
DECLARE
  user_id text;
  candidate text;
BEGIN
  FOR user_id IN SELECT id FROM users WHERE uid IS NULL LOOP
    LOOP
      candidate := lpad((floor(random() * 999999999)::bigint + 1)::text, 9, '0');
      BEGIN
        UPDATE users SET uid = candidate WHERE id = user_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Retry a collision without changing any existing UID.
      END;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE users ALTER COLUMN uid SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_uid_format CHECK (uid ~ '^[0-9]{9}$' AND uid <> '000000000');
