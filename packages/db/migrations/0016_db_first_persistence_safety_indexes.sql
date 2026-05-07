-- Pass 1B: targeted persistence safety indexes for DB-first registration/applicant/document/payment commands.

DROP INDEX IF EXISTS document_assets_application_sha256_unique;

CREATE INDEX IF NOT EXISTS idx_document_assets_application_sha256
  ON document_assets (application_id, sha256);

CREATE INDEX IF NOT EXISTS idx_document_upload_sessions_active_hash
  ON document_upload_sessions (application_id, document_type, sha256, status)
  WHERE status <> 'COMPLETED';

CREATE UNIQUE INDEX IF NOT EXISTS ux_document_upload_sessions_idempotency_key
  ON document_upload_sessions (application_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS ux_document_upload_sessions_idempotency_key;
DROP INDEX IF EXISTS idx_document_upload_sessions_active_hash;
DROP INDEX IF EXISTS idx_document_assets_application_sha256;

CREATE UNIQUE INDEX IF NOT EXISTS document_assets_application_sha256_unique
  ON document_assets(application_id, sha256);
