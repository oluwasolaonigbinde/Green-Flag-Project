-- Slice 3 registration, eligibility, verification, and admin approval workflow.

CREATE TABLE IF NOT EXISTS registration_submissions (
  id uuid PRIMARY KEY,
  organisation_id uuid REFERENCES organisations(id),
  park_id uuid REFERENCES parks(id),
  status text NOT NULL CHECK (status IN ('STARTED', 'ELIGIBILITY_FAILED', 'PENDING_VERIFICATION', 'VERIFIED_PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PURGED')),
  park_name text NOT NULL,
  organisation_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  address_line_1 text NOT NULL,
  town text NOT NULL,
  postcode text,
  country text NOT NULL,
  publicly_accessible boolean NOT NULL,
  free_to_enter boolean NOT NULL,
  minimum_size_confirmed boolean NOT NULL,
  duplicate_warning_state text NOT NULL CHECK (duplicate_warning_state IN ('NONE', 'WARNING_REQUIRES_ACK', 'ACKNOWLEDGED')),
  duplicate_matched_fields text[] NOT NULL DEFAULT '{}',
  location_payload jsonb NOT NULL,
  submitted_payload jsonb NOT NULL,
  email_verified_at_utc timestamptz,
  admin_decision_reason text,
  reviewed_by_internal_user_id uuid REFERENCES internal_users(id),
  reviewed_at_utc timestamptz,
  submitted_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_submissions_status ON registration_submissions (status);
CREATE INDEX IF NOT EXISTS idx_registration_submissions_contact_email ON registration_submissions (contact_email);
CREATE INDEX IF NOT EXISTS idx_registration_submissions_park_name ON registration_submissions (park_name);

CREATE TABLE IF NOT EXISTS registration_verification_tokens (
  id uuid PRIMARY KEY,
  registration_submission_id uuid NOT NULL REFERENCES registration_submissions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'PURGED')),
  expires_at_utc timestamptz NOT NULL,
  used_at_utc timestamptz,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_verification_tokens_submission_id
  ON registration_verification_tokens (registration_submission_id);

CREATE TABLE IF NOT EXISTS registration_notification_intents (
  id uuid PRIMARY KEY,
  registration_submission_id uuid NOT NULL REFERENCES registration_submissions(id) ON DELETE CASCADE,
  intent_type text NOT NULL CHECK (intent_type IN ('registration_verification_email', 'admin_duplicate_alert', 'registration_approved_email', 'registration_rejected_email')),
  status text NOT NULL CHECK (status IN ('QUEUED', 'DISPATCH_STUBBED', 'CANCELLED')),
  payload_snapshot jsonb NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_notification_intents_submission_id
  ON registration_notification_intents (registration_submission_id);

-- migrate:down
DROP INDEX IF EXISTS idx_registration_notification_intents_submission_id;
DROP TABLE IF EXISTS registration_notification_intents;
DROP INDEX IF EXISTS idx_registration_verification_tokens_submission_id;
DROP TABLE IF EXISTS registration_verification_tokens;
DROP INDEX IF EXISTS idx_registration_submissions_park_name;
DROP INDEX IF EXISTS idx_registration_submissions_contact_email;
DROP INDEX IF EXISTS idx_registration_submissions_status;
DROP TABLE IF EXISTS registration_submissions;
