ALTER TABLE cards ADD COLUMN stock integer CHECK (stock >= 0 AND stock <= 2147483647);
