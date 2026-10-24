ALTER TABLE users ADD CONSTRAINT users_address_object_check
 CHECK (address IS NULL OR jsonb_typeof(address)='object');
ALTER TABLE cards DROP CONSTRAINT cards_ratio_check;
ALTER TABLE cards ADD CONSTRAINT cards_ratio_check
 CHECK (jsonb_typeof(ratio)='object' AND ratio ? 'w' AND ratio ? 'h' AND
   jsonb_typeof(ratio->'w')='number' AND jsonb_typeof(ratio->'h')='number' AND
   (ratio->>'w')::int BETWEEN 1 AND 1000 AND (ratio->>'h')::int BETWEEN 1 AND 1000);
ALTER TABLE exchanges ADD CONSTRAINT exchanges_address_object_check
 CHECK (jsonb_typeof("fromAddress")='object');
