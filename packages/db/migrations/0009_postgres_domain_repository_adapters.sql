-- Slice 8.6: PostgreSQL domain repository adapter support.
-- Adds payload columns needed to round-trip the already-approved Slice 3-8 DTOs.
-- These columns support runtime persistence only; they do not introduce Slice 9 allocation tables.

ALTER TABLE registration_submissions
  ADD COLUMN IF NOT EXISTS runtime_payload jsonb;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS runtime_payload jsonb;

ALTER TABLE document_assets
  ADD COLUMN IF NOT EXISTS runtime_payload jsonb;

ALTER TABLE document_upload_sessions
  ADD COLUMN IF NOT EXISTS runtime_payload jsonb;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS runtime_payload jsonb;

ALTER TABLE payment_states
  ADD COLUMN IF NOT EXISTS runtime_payload jsonb;

ALTER TABLE assessor_profiles
  ADD COLUMN IF NOT EXISTS runtime_payload jsonb;

-- migrate:down

ALTER TABLE assessor_profiles DROP COLUMN IF EXISTS runtime_payload;
ALTER TABLE payment_states DROP COLUMN IF EXISTS runtime_payload;
ALTER TABLE invoices DROP COLUMN IF EXISTS runtime_payload;
ALTER TABLE document_upload_sessions DROP COLUMN IF EXISTS runtime_payload;
ALTER TABLE document_assets DROP COLUMN IF EXISTS runtime_payload;
ALTER TABLE applications DROP COLUMN IF EXISTS runtime_payload;
ALTER TABLE registration_submissions DROP COLUMN IF EXISTS runtime_payload;
