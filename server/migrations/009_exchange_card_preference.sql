ALTER TABLE exchanges
  ADD COLUMN "preferredCardId" text REFERENCES cards(id) ON DELETE SET NULL,
  ADD COLUMN "preferredCardTitle" text;
