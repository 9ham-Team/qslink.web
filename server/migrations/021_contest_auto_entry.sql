-- Cards may opt into the contest at upload time. The description is reviewed
-- together with the card and only published after the card is approved.
ALTER TABLE cards ADD COLUMN "contestOptIn" boolean;
ALTER TABLE cards ADD COLUMN "contestDescription" text;
ALTER TABLE cards ADD CONSTRAINT cards_contest_auto_entry_check
  CHECK ("contestOptIn" IS NOT TRUE OR
    ("contestDescription" IS NOT NULL AND char_length("contestDescription") BETWEEN 1 AND 2000));
