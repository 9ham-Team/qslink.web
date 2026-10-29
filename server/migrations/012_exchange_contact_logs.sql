ALTER TABLE exchanges ADD COLUMN "selectedContactLogs" jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK (jsonb_typeof("selectedContactLogs") = 'array' AND jsonb_array_length("selectedContactLogs") <= 100);
