-- NULL means no recorded acceptance, including legacy/imported/demo records.
ALTER TABLE users ADD COLUMN "legalConsent" jsonb;
ALTER TABLE cards ADD COLUMN "contentConsent" jsonb;
ALTER TABLE users ADD CONSTRAINT users_legal_consent_object
 CHECK ("legalConsent" IS NULL OR jsonb_typeof("legalConsent") = 'object');
ALTER TABLE cards ADD CONSTRAINT cards_content_consent_object
 CHECK ("contentConsent" IS NULL OR jsonb_typeof("contentConsent") = 'object');
