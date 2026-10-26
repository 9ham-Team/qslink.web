-- Different applicants may exchange the same card independently.
-- Keep exchanges_active_unique: one active application per card and applicant.
DROP INDEX exchanges_approved_unique;
