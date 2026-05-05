-- Slice 1 identity, RBAC, and audit foundation.
-- This migration adds the approved auth/RBAC/audit tables only.

CREATE TABLE IF NOT EXISTS internal_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED', 'PENDING_LINK')),
  redaction_profile text NOT NULL,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cognito_identity_links (
  id uuid PRIMARY KEY,
  internal_user_id uuid NOT NULL REFERENCES internal_users(id) ON DELETE CASCADE,
  cognito_subject text NOT NULL UNIQUE,
  issuer text NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  mfa_satisfied boolean NOT NULL DEFAULT false,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (internal_user_id, issuer)
);

CREATE TABLE IF NOT EXISTS role_assignments (
  id uuid PRIMARY KEY,
  internal_user_id uuid NOT NULL REFERENCES internal_users(id) ON DELETE CASCADE,
  role_type text NOT NULL,
  scope_type text NOT NULL,
  scope_id uuid,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  redaction_profile text NOT NULL,
  created_by_user_id uuid REFERENCES internal_users(id),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (internal_user_id, role_type, scope_type, scope_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_role_assignments_null_scope
  ON role_assignments (internal_user_id, role_type, scope_type)
  WHERE scope_id IS NULL;

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES internal_users(id),
  actor_role text NOT NULL,
  actor_scope_type text NOT NULL,
  actor_scope_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  request_id text NOT NULL,
  idempotency_key text,
  ip_address text,
  user_agent text,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cognito_identity_links_subject ON cognito_identity_links (cognito_subject);
CREATE INDEX IF NOT EXISTS idx_role_assignments_user ON role_assignments (internal_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_user_id, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS admin_override_events (
  id uuid PRIMARY KEY,
  override_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  authority text NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES internal_users(id),
  actor_role text NOT NULL,
  actor_scope_type text NOT NULL,
  actor_scope_id uuid,
  prior_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  linked_audit_event_id uuid REFERENCES audit_events(id),
  request_id text NOT NULL,
  correlation_id text,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_override_events_target ON admin_override_events (target_type, target_id, created_at_utc DESC);

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
DROP FUNCTION IF EXISTS prevent_audit_event_mutation();

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_event_mutation();

DROP TRIGGER IF EXISTS admin_override_events_no_update ON admin_override_events;

CREATE TRIGGER admin_override_events_no_update
BEFORE UPDATE OR DELETE ON admin_override_events
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_event_mutation();

-- migrate:down
DROP TRIGGER IF EXISTS admin_override_events_no_update ON admin_override_events;
DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
DROP FUNCTION IF EXISTS prevent_audit_event_mutation();
DROP INDEX IF EXISTS idx_admin_override_events_target;
DROP TABLE IF EXISTS admin_override_events;
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS role_assignments;
DROP TABLE IF EXISTS cognito_identity_links;
DROP TABLE IF EXISTS internal_users;
