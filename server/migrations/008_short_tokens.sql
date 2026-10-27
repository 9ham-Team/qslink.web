ALTER TABLE cards ALTER COLUMN "shortToken" SET NOT NULL;
ALTER TABLE cards ADD CONSTRAINT cards_short_token_format CHECK("shortToken" ~ '^[A-Za-z]{6}$');
CREATE UNIQUE INDEX cards_short_token_unique ON cards("shortToken" COLLATE "C");

CREATE TABLE card_share_tokens (
  token text COLLATE "C" PRIMARY KEY,
  "cardId" text NOT NULL REFERENCES cards(id) ON DELETE CASCADE
);
INSERT INTO card_share_tokens(token, "cardId")
SELECT "shareToken", id FROM cards UNION SELECT "shortToken", id FROM cards;

CREATE FUNCTION sync_card_share_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM card_share_tokens WHERE "cardId" = NEW.id;
  INSERT INTO card_share_tokens(token, "cardId")
  SELECT NEW."shareToken", NEW.id UNION SELECT NEW."shortToken", NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cards_share_tokens_sync
AFTER INSERT OR UPDATE OF "shareToken", "shortToken" ON cards
FOR EACH ROW EXECUTE FUNCTION sync_card_share_tokens();
