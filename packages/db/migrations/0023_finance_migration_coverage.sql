-- Goal 2 finance migration coverage.
-- Adds additive finance fact coverage without copying legacy Fee or Invoice table shapes.

CREATE TABLE IF NOT EXISTS fee_schedules (
  id uuid PRIMARY KEY,
  schedule_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'inactive', 'superseded', 'voided')),
  effective_from date NOT NULL,
  effective_to date,
  country_code text CHECK (country_code IS NULL OR char_length(country_code) BETWEEN 2 AND 3),
  pricing_scope_type text NOT NULL DEFAULT 'country' CHECK (
    pricing_scope_type IN (
      'country',
      'operator_scope',
      'finance_scope',
      'organisation_specific',
      'global',
      'legacy_import'
    )
  ),
  pricing_scope_key text,
  operator_scope_code text,
  finance_scope_key text,
  operator_organisation_id uuid REFERENCES organisations(id) ON DELETE RESTRICT,
  award_track_code text REFERENCES award_tracks(code) ON DELETE RESTRICT,
  award_category_id uuid,
  currency text NOT NULL CHECK (char_length(currency) = 3),
  currency_precision integer NOT NULL DEFAULT 2 CHECK (currency_precision BETWEEN 0 AND 4),
  tax_name text,
  tax_rate numeric(7,4) CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)),
  tax_configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuration_source text NOT NULL CHECK (
    configuration_source IN ('lower_env_placeholder', 'kbt_finance_approved', 'legacy_import')
  ),
  approved_by_actor_id uuid REFERENCES internal_users(id) ON DELETE RESTRICT,
  approved_at_utc timestamptz,
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_key, version),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (
    configuration_source <> 'kbt_finance_approved'
    OR (approved_by_actor_id IS NOT NULL AND approved_at_utc IS NOT NULL)
  ),
  CHECK (
    pricing_scope_type <> 'organisation_specific'
    OR operator_organisation_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_fee_schedules_active_lookup
  ON fee_schedules (status, country_code, pricing_scope_type, award_track_code, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS fee_schedule_lines (
  id uuid PRIMARY KEY,
  fee_schedule_id uuid NOT NULL REFERENCES fee_schedules(id) ON DELETE RESTRICT,
  line_code text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive', 'superseded', 'voided')),
  country_code text CHECK (country_code IS NULL OR char_length(country_code) BETWEEN 2 AND 3),
  pricing_scope_type text NOT NULL DEFAULT 'country' CHECK (
    pricing_scope_type IN (
      'country',
      'operator_scope',
      'finance_scope',
      'organisation_specific',
      'global',
      'legacy_import'
    )
  ),
  pricing_scope_key text,
  operator_scope_code text,
  finance_scope_key text,
  operator_organisation_id uuid REFERENCES organisations(id) ON DELETE RESTRICT,
  award_track_code text REFERENCES award_tracks(code) ON DELETE RESTRICT,
  award_category_id uuid,
  min_area_hectares numeric(10,2) CHECK (min_area_hectares IS NULL OR min_area_hectares >= 0),
  max_area_hectares numeric(10,2) CHECK (max_area_hectares IS NULL OR max_area_hectares > 0),
  legacy_hectare_marker text,
  unit_amount numeric(14,2) NOT NULL CHECK (unit_amount >= 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  currency_precision integer NOT NULL DEFAULT 2 CHECK (currency_precision BETWEEN 0 AND 4),
  tax_name text,
  tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_inclusive boolean NOT NULL DEFAULT false,
  source_reference_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fee_schedule_id, line_code),
  CHECK (max_area_hectares IS NULL OR min_area_hectares IS NULL OR max_area_hectares > min_area_hectares)
);

CREATE INDEX IF NOT EXISTS idx_fee_schedule_lines_lookup
  ON fee_schedule_lines (
    fee_schedule_id,
    status,
    country_code,
    pricing_scope_type,
    award_track_code,
    min_area_hectares,
    max_area_hectares
  );

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_number_scope text NOT NULL DEFAULT 'lower_env_placeholder',
  ADD COLUMN IF NOT EXISTS invoice_number_policy_snapshot jsonb NOT NULL DEFAULT '{"source":"lower_env_placeholder"}'::jsonb,
  ADD COLUMN IF NOT EXISTS park_id uuid REFERENCES parks(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS park_name_snapshot text,
  ADD COLUMN IF NOT EXISTS organisation_name_snapshot text,
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text,
  ADD COLUMN IF NOT EXISTS billing_address_line1 text,
  ADD COLUMN IF NOT EXISTS billing_address_line2 text,
  ADD COLUMN IF NOT EXISTS billing_address_line3 text,
  ADD COLUMN IF NOT EXISTS billing_postcode text,
  ADD COLUMN IF NOT EXISTS billing_region text,
  ADD COLUMN IF NOT EXISTS purchase_order_number_snapshot text,
  ADD COLUMN IF NOT EXISTS no_purchase_order_declared_snapshot boolean,
  ADD COLUMN IF NOT EXISTS currency text CHECK (currency IS NULL OR char_length(currency) = 3),
  ADD COLUMN IF NOT EXISTS currency_precision integer NOT NULL DEFAULT 2 CHECK (currency_precision BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(14,2) CHECK (subtotal_amount IS NULL OR subtotal_amount >= 0),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) CHECK (tax_amount IS NULL OR tax_amount >= 0),
  ADD COLUMN IF NOT EXISTS total_amount numeric(14,2) CHECK (total_amount IS NULL OR total_amount >= 0),
  ADD COLUMN IF NOT EXISTS tax_name text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(7,4) CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)),
  ADD COLUMN IF NOT EXISTS payment_terms_snapshot jsonb NOT NULL DEFAULT '{"source":"lower_env_placeholder"}'::jsonb,
  ADD COLUMN IF NOT EXISTS due_date_source text NOT NULL DEFAULT 'lower_env_placeholder' CHECK (
    due_date_source IN ('cycle_config', 'finance_config', 'legacy_import', 'manual_override', 'lower_env_placeholder')
  ),
  ADD COLUMN IF NOT EXISTS payment_terms_config_id uuid,
  ADD COLUMN IF NOT EXISTS due_date_override_reason text,
  ADD COLUMN IF NOT EXISTS generated_at_utc timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at_utc timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at_utc timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at_utc timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at_utc timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_invoice_id uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS correction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legacy_import_reference text,
  ADD COLUMN IF NOT EXISTS source_reference_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT invoices_total_amounts_match_check
    CHECK (
      subtotal_amount IS NULL
      OR tax_amount IS NULL
      OR total_amount IS NULL
      OR total_amount = round(subtotal_amount + tax_amount, currency_precision)
    );

WITH invoice_backfill AS (
  SELECT
    i.id,
    a.park_id,
    p.organisation_id,
    p.name AS park_name,
    o.name AS organisation_name,
    ps.purchase_order_number,
    ps.no_purchase_order_declared
  FROM invoices i
  JOIN applications a ON a.id = i.application_id
  JOIN parks p ON p.id = a.park_id
  JOIN organisations o ON o.id = p.organisation_id
  LEFT JOIN payment_states ps ON ps.invoice_id = i.id
)
UPDATE invoices i
SET
  invoice_number = COALESCE(i.invoice_number, 'LOWER-ENV-INVOICE-' || replace(i.id::text, '-', '')),
  invoice_number_scope = COALESCE(i.invoice_number_scope, 'lower_env_placeholder'),
  invoice_number_policy_snapshot = COALESCE(i.invoice_number_policy_snapshot, '{"source":"lower_env_placeholder"}'::jsonb),
  park_id = COALESCE(i.park_id, invoice_backfill.park_id),
  organisation_id = COALESCE(i.organisation_id, invoice_backfill.organisation_id),
  park_name_snapshot = COALESCE(i.park_name_snapshot, invoice_backfill.park_name),
  organisation_name_snapshot = COALESCE(i.organisation_name_snapshot, invoice_backfill.organisation_name),
  billing_name = COALESCE(i.billing_name, invoice_backfill.organisation_name),
  purchase_order_number_snapshot = COALESCE(i.purchase_order_number_snapshot, invoice_backfill.purchase_order_number),
  no_purchase_order_declared_snapshot = COALESCE(i.no_purchase_order_declared_snapshot, invoice_backfill.no_purchase_order_declared),
  currency = COALESCE(i.currency, 'XXX'),
  currency_precision = COALESCE(i.currency_precision, 2),
  subtotal_amount = COALESCE(i.subtotal_amount, 0.00),
  tax_amount = COALESCE(i.tax_amount, 0.00),
  total_amount = COALESCE(i.total_amount, 0.00),
  tax_rate = COALESCE(i.tax_rate, 0.0000),
  payment_terms_snapshot = COALESCE(i.payment_terms_snapshot, '{"source":"lower_env_placeholder","deadlineSource":"existing_due_at"}'::jsonb),
  due_date_source = COALESCE(i.due_date_source, 'lower_env_placeholder'),
  generated_at_utc = COALESCE(i.generated_at_utc, i.created_at),
  source_reference_metadata = COALESCE(i.source_reference_metadata, '{}'::jsonb) || '{"goal2Backfill":"amount_marker_unavailable"}'::jsonb
FROM invoice_backfill
WHERE invoice_backfill.id = i.id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_invoice_number_scope_number
  ON invoices (invoice_number_scope, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_finance_status_due
  ON invoices (status, due_at, currency, total_amount);

CREATE INDEX IF NOT EXISTS idx_invoices_application_episode_finance
  ON invoices (application_id, assessment_episode_id, park_id, organisation_id);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  fee_schedule_line_id uuid REFERENCES fee_schedule_lines(id) ON DELETE RESTRICT,
  description text NOT NULL,
  quantity numeric(12,4) NOT NULL CHECK (quantity > 0),
  unit_amount numeric(14,2) NOT NULL CHECK (unit_amount >= 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  currency_precision integer NOT NULL DEFAULT 2 CHECK (currency_precision BETWEEN 0 AND 4),
  tax_name text,
  tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount numeric(14,2) NOT NULL CHECK (tax_amount >= 0),
  line_subtotal numeric(14,2) NOT NULL CHECK (line_subtotal >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  application_area_snapshot_id uuid REFERENCES application_area_snapshots(id) ON DELETE RESTRICT,
  source_reference_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at_utc timestamptz NOT NULL DEFAULT now(),
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, line_number),
  CHECK (line_subtotal = round(quantity * unit_amount, currency_precision)),
  CHECK (line_total = round(line_subtotal + tax_amount, currency_precision))
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice
  ON invoice_lines (invoice_id, line_number);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_fee_schedule_line
  ON invoice_lines (fee_schedule_line_id)
  WHERE fee_schedule_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_area_snapshot
  ON invoice_lines (application_area_snapshot_id)
  WHERE application_area_snapshot_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN (
      'manual_mark_paid',
      'payment_override',
      'deadline_block_applied',
      'provider_event_placeholder',
      'legacy_import',
      'exported',
      'export_failed',
      'refund_placeholder',
      'voided',
      'reconciled',
      'correction'
    )
  ),
  event_status text NOT NULL CHECK (
    event_status IN ('received', 'accepted', 'rejected', 'superseded', 'requires_review')
  ),
  amount numeric(14,2) CHECK (amount IS NULL OR amount >= 0),
  currency text CHECK (currency IS NULL OR char_length(currency) = 3),
  payment_method text CHECK (
    payment_method IS NULL OR payment_method IN (
      'manual',
      'bank_transfer',
      'card_provider',
      'purchase_order',
      'legacy_import',
      'none',
      'unknown'
    )
  ),
  source text NOT NULL CHECK (
    source IN ('admin_action', 'provider_webhook', 'legacy_import', 'system_job', 'finance_export')
  ),
  actor_id uuid REFERENCES internal_users(id) ON DELETE RESTRICT,
  occurred_at_utc timestamptz NOT NULL DEFAULT now(),
  provider text,
  provider_reference text,
  provider_payload_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_event_id uuid REFERENCES audit_events(id) ON DELETE RESTRICT,
  admin_override_event_id uuid REFERENCES admin_override_events(id) ON DELETE RESTRICT,
  notes text,
  created_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_invoice_occurred
  ON payment_events (invoice_id, occurred_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_payment_events_type_status
  ON payment_events (event_type, event_status, occurred_at_utc DESC);

CREATE TABLE IF NOT EXISTS finance_export_runs (
  id uuid PRIMARY KEY,
  export_job_id uuid REFERENCES export_jobs(id) ON DELETE RESTRICT,
  export_type text NOT NULL CHECK (
    export_type IN (
      'invoice_csv',
      'payment_csv',
      'business_central_invoice',
      'business_central_payment'
    )
  ),
  export_format text NOT NULL CHECK (export_format IN ('csv', 'json', 'api_payload_placeholder')),
  status text NOT NULL CHECK (
    status IN (
      'requested',
      'generated',
      'sent_manual',
      'sent_adapter',
      'acknowledged',
      'failed',
      'requires_review',
      'voided'
    )
  ),
  export_scope text NOT NULL DEFAULT 'batch',
  invoice_id uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  requested_by_actor_id uuid REFERENCES internal_users(id) ON DELETE RESTRICT,
  exported_row_count integer NOT NULL DEFAULT 0 CHECK (exported_row_count >= 0),
  exported_subtotal_amount numeric(14,2) CHECK (exported_subtotal_amount IS NULL OR exported_subtotal_amount >= 0),
  exported_tax_amount numeric(14,2) CHECK (exported_tax_amount IS NULL OR exported_tax_amount >= 0),
  exported_total_amount numeric(14,2) CHECK (exported_total_amount IS NULL OR exported_total_amount >= 0),
  currency_group_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_key text,
  business_central_reference text,
  business_central_status text,
  business_central_error_code text,
  business_central_error_detail text,
  reconciliation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at_utc timestamptz NOT NULL DEFAULT now(),
  exported_at_utc timestamptz,
  acknowledged_at_utc timestamptz,
  failed_at_utc timestamptz,
  created_at_utc timestamptz NOT NULL DEFAULT now(),
  updated_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_export_runs_job
  ON finance_export_runs (export_job_id);

CREATE INDEX IF NOT EXISTS idx_finance_export_runs_status
  ON finance_export_runs (export_type, status, requested_at_utc DESC);

INSERT INTO fee_schedules (
  id,
  schedule_key,
  version,
  status,
  effective_from,
  country_code,
  pricing_scope_type,
  award_track_code,
  currency,
  currency_precision,
  tax_rate,
  configuration_source,
  notes
)
VALUES (
  '23000000-0000-4000-8000-000000000001',
  'lower-env-placeholder-standard',
  1,
  'active',
  '2000-01-01',
  NULL,
  'global',
  NULL,
  'XXX',
  2,
  0.0000,
  'lower_env_placeholder',
  'Synthetic lower-env placeholder. Production fee configuration requires KBT Finance approval.'
)
ON CONFLICT (schedule_key, version) DO NOTHING;

INSERT INTO fee_schedule_lines (
  id,
  fee_schedule_id,
  line_code,
  description,
  status,
  country_code,
  pricing_scope_type,
  award_track_code,
  min_area_hectares,
  max_area_hectares,
  unit_amount,
  currency,
  currency_precision,
  tax_rate,
  tax_inclusive,
  source_reference_metadata
)
VALUES (
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000001',
  'lower-env-placeholder-line',
  'Lower-env placeholder finance line',
  'active',
  NULL,
  'global',
  NULL,
  NULL,
  NULL,
  0.00,
  'XXX',
  2,
  0.0000,
  false,
  '{"source":"lower_env_placeholder"}'::jsonb
)
ON CONFLICT (fee_schedule_id, line_code) DO NOTHING;

INSERT INTO invoice_lines (
  id,
  invoice_id,
  line_number,
  fee_schedule_line_id,
  description,
  quantity,
  unit_amount,
  currency,
  currency_precision,
  tax_rate,
  tax_amount,
  line_subtotal,
  line_total,
  source_reference_metadata
)
SELECT
  ('23000000-0000-4000-8000-' || lpad(row_number() OVER (ORDER BY i.id)::text, 12, '0'))::uuid,
  i.id,
  1,
  '23000000-0000-4000-8000-000000000002',
  'Lower-env reconstructed placeholder invoice line',
  1.0000,
  0.00,
  COALESCE(i.currency, 'XXX'),
  COALESCE(i.currency_precision, 2),
  COALESCE(i.tax_rate, 0.0000),
  COALESCE(i.tax_amount, 0.00),
  COALESCE(i.subtotal_amount, 0.00),
  COALESCE(i.total_amount, 0.00),
  '{"source":"goal_2_existing_invoice_backfill","lineDetail":"unavailable"}'::jsonb
FROM invoices i
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_lines il WHERE il.invoice_id = i.id
)
ON CONFLICT (invoice_id, line_number) DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_invoice_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'invoice_lines are immutable once generated or imported';
END;
$$;

CREATE TRIGGER invoice_lines_no_update
BEFORE UPDATE OR DELETE ON invoice_lines
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_line_mutation();

CREATE OR REPLACE FUNCTION prevent_payment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payment_events is append-only';
END;
$$;

CREATE TRIGGER payment_events_no_update
BEFORE UPDATE OR DELETE ON payment_events
FOR EACH ROW
EXECUTE FUNCTION prevent_payment_event_mutation();

CREATE OR REPLACE FUNCTION prevent_invoice_finance_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.generated_at_utc IS NOT NULL AND (
    NEW.application_id IS DISTINCT FROM OLD.application_id OR
    NEW.assessment_episode_id IS DISTINCT FROM OLD.assessment_episode_id OR
    NEW.amount_marker IS DISTINCT FROM OLD.amount_marker OR
    NEW.due_at IS DISTINCT FROM OLD.due_at OR
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.invoice_number_scope IS DISTINCT FROM OLD.invoice_number_scope OR
    NEW.invoice_number_policy_snapshot IS DISTINCT FROM OLD.invoice_number_policy_snapshot OR
    NEW.park_id IS DISTINCT FROM OLD.park_id OR
    NEW.organisation_id IS DISTINCT FROM OLD.organisation_id OR
    NEW.park_name_snapshot IS DISTINCT FROM OLD.park_name_snapshot OR
    NEW.organisation_name_snapshot IS DISTINCT FROM OLD.organisation_name_snapshot OR
    NEW.billing_name IS DISTINCT FROM OLD.billing_name OR
    NEW.billing_contact_name IS DISTINCT FROM OLD.billing_contact_name OR
    NEW.billing_email IS DISTINCT FROM OLD.billing_email OR
    NEW.billing_phone IS DISTINCT FROM OLD.billing_phone OR
    NEW.billing_address_line1 IS DISTINCT FROM OLD.billing_address_line1 OR
    NEW.billing_address_line2 IS DISTINCT FROM OLD.billing_address_line2 OR
    NEW.billing_address_line3 IS DISTINCT FROM OLD.billing_address_line3 OR
    NEW.billing_postcode IS DISTINCT FROM OLD.billing_postcode OR
    NEW.billing_region IS DISTINCT FROM OLD.billing_region OR
    NEW.purchase_order_number_snapshot IS DISTINCT FROM OLD.purchase_order_number_snapshot OR
    NEW.no_purchase_order_declared_snapshot IS DISTINCT FROM OLD.no_purchase_order_declared_snapshot OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.currency_precision IS DISTINCT FROM OLD.currency_precision OR
    NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount OR
    NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.tax_name IS DISTINCT FROM OLD.tax_name OR
    NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR
    NEW.payment_terms_snapshot IS DISTINCT FROM OLD.payment_terms_snapshot OR
    NEW.due_date_source IS DISTINCT FROM OLD.due_date_source OR
    NEW.payment_terms_config_id IS DISTINCT FROM OLD.payment_terms_config_id OR
    NEW.due_date_override_reason IS DISTINCT FROM OLD.due_date_override_reason OR
    NEW.generated_at_utc IS DISTINCT FROM OLD.generated_at_utc OR
    NEW.legacy_import_reference IS DISTINCT FROM OLD.legacy_import_reference OR
    NEW.source_reference_metadata IS DISTINCT FROM OLD.source_reference_metadata
  ) THEN
    RAISE EXCEPTION 'issued or imported invoice finance facts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_finance_facts_no_update
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_finance_fact_mutation();

INSERT INTO migration_target_entity_types (code, label, target_table, id_column, validation_mode, notes)
VALUES
  ('fee_schedule', 'Fee schedule', 'fee_schedules', 'id', 'uuid_table_lookup', 'Versioned finance schedule/configuration shell.'),
  ('fee_schedule_line', 'Fee schedule line', 'fee_schedule_lines', 'id', 'uuid_table_lookup', 'Versioned finance schedule line.'),
  ('invoice_line', 'Invoice line', 'invoice_lines', 'id', 'uuid_table_lookup', 'Frozen invoice line facts.'),
  ('payment_event', 'Payment event', 'payment_events', 'id', 'uuid_table_lookup', 'Append-only payment/import/export event.'),
  ('finance_export_run', 'Finance export run', 'finance_export_runs', 'id', 'uuid_table_lookup', 'Manual/CSV finance export status and reconciliation boundary.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO migration_source_table_catalog (
  id,
  source_system,
  source_database,
  source_schema,
  source_table,
  source_group,
  business_owner,
  classification,
  primary_key_columns,
  natural_key_columns,
  retention_decision,
  notes
)
VALUES
  (
    '23000000-0000-4000-8000-000000000011',
    'legacy_greenflag_live',
    'GreenFlag_Live',
    'dbo',
    'InvoicingOrganisation',
    'InvoicingOrganisation',
    'KBT Finance',
    'finance',
    ARRAY['ID'],
    ARRAY['Name'],
    'archive_only',
    'Legacy finance/operator content source. Runtime use requires explicit finance/product classification.'
  ),
  (
    '23000000-0000-4000-8000-000000000012',
    'legacy_greenflag_live',
    'GreenFlag_Live',
    'dbo',
    'InvoicingOrganisationTeam',
    'InvoicingOrganisationTeam',
    'KBT Finance',
    'finance',
    ARRAY['ID'],
    ARRAY['InvoicingOrganisationID'],
    'archive_only',
    'Legacy finance/operator team/content source. Public/legal content remains archive-only until approved.'
  )
ON CONFLICT (source_system, source_database, source_schema, source_table) DO NOTHING;

INSERT INTO migration_mapping_rules (
  id,
  catalog_id,
  source_group,
  mapping_version,
  required_target_entity_types,
  optional_target_entity_types,
  archive_required,
  allow_unlinked_source,
  missing_target_severity,
  rule_status,
  notes
)
SELECT
  '23000000-0000-4000-8000-000000000101',
  id,
  'Fee',
  'goal-2-finance-migration.v1',
  ARRAY['fee_schedule', 'fee_schedule_line'],
  ARRAY['invoice_line'],
  false,
  false,
  'error',
  'active',
  'Legacy Fee rows reconcile to configurable fee schedules/lines through Goal 1 provenance links.'
FROM migration_source_table_catalog
WHERE source_system = 'legacy_greenflag_live'
  AND source_database = 'GreenFlag_Live'
  AND source_schema = 'dbo'
  AND source_table = 'Fee'
ON CONFLICT (catalog_id, mapping_version) DO UPDATE SET
  required_target_entity_types = EXCLUDED.required_target_entity_types,
  optional_target_entity_types = EXCLUDED.optional_target_entity_types,
  archive_required = EXCLUDED.archive_required,
  allow_unlinked_source = EXCLUDED.allow_unlinked_source,
  missing_target_severity = EXCLUDED.missing_target_severity,
  rule_status = EXCLUDED.rule_status,
  notes = EXCLUDED.notes,
  updated_at_utc = now();

INSERT INTO migration_mapping_rules (
  id,
  catalog_id,
  source_group,
  mapping_version,
  required_target_entity_types,
  optional_target_entity_types,
  archive_required,
  allow_unlinked_source,
  missing_target_severity,
  rule_status,
  notes
)
SELECT
  '23000000-0000-4000-8000-000000000102',
  id,
  'Invoice',
  'goal-2-finance-migration.v1',
  ARRAY['invoice', 'invoice_line'],
  ARRAY['payment_state', 'payment_event'],
  false,
  false,
  'error',
  'active',
  'Legacy Invoice rows reconcile to immutable invoice headers/lines and compatible payment state/event records.'
FROM migration_source_table_catalog
WHERE source_system = 'legacy_greenflag_live'
  AND source_database = 'GreenFlag_Live'
  AND source_schema = 'dbo'
  AND source_table = 'Invoice'
ON CONFLICT (catalog_id, mapping_version) DO UPDATE SET
  required_target_entity_types = EXCLUDED.required_target_entity_types,
  optional_target_entity_types = EXCLUDED.optional_target_entity_types,
  archive_required = EXCLUDED.archive_required,
  allow_unlinked_source = EXCLUDED.allow_unlinked_source,
  missing_target_severity = EXCLUDED.missing_target_severity,
  rule_status = EXCLUDED.rule_status,
  notes = EXCLUDED.notes,
  updated_at_utc = now();

INSERT INTO migration_mapping_rules (
  id,
  catalog_id,
  source_group,
  mapping_version,
  required_target_entity_types,
  optional_target_entity_types,
  archive_required,
  allow_unlinked_source,
  missing_target_severity,
  rule_status,
  notes
)
SELECT
  '23000000-0000-4000-8000-000000000103',
  id,
  'ParkAwardApplication',
  'goal-2-finance-migration.v1',
  ARRAY['application', 'assessment_episode', 'application_area_snapshot'],
  ARRAY['invoice', 'invoice_line', 'payment_state', 'payment_event'],
  false,
  false,
  'error',
  'active',
  'ParkAwardApplication finance fields reconcile to applications, episodes, application area snapshots, and finance targets where applicable.'
FROM migration_source_table_catalog
WHERE source_system = 'legacy_greenflag_live'
  AND source_database = 'GreenFlag_Live'
  AND source_schema = 'dbo'
  AND source_table = 'ParkAwardApplication'
ON CONFLICT (catalog_id, mapping_version) DO UPDATE SET
  required_target_entity_types = EXCLUDED.required_target_entity_types,
  optional_target_entity_types = EXCLUDED.optional_target_entity_types,
  archive_required = EXCLUDED.archive_required,
  allow_unlinked_source = EXCLUDED.allow_unlinked_source,
  missing_target_severity = EXCLUDED.missing_target_severity,
  rule_status = EXCLUDED.rule_status,
  notes = EXCLUDED.notes,
  updated_at_utc = now();

INSERT INTO migration_mapping_rules (
  id,
  catalog_id,
  source_group,
  mapping_version,
  required_target_entity_types,
  optional_target_entity_types,
  archive_required,
  allow_unlinked_source,
  missing_target_severity,
  rule_status,
  notes
)
SELECT
  '23000000-0000-4000-8000-000000000104',
  id,
  'EmailLog',
  'goal-2-finance-migration.v1',
  ARRAY[]::text[],
  ARRAY['notification_log', 'payment_event', 'archive_record'],
  true,
  false,
  'warning',
  'active',
  'Finance-related EmailLog rows remain archive-first; safe links can be added where invoice/payment delivery evidence is approved.'
FROM migration_source_table_catalog
WHERE source_system = 'legacy_greenflag_live'
  AND source_database = 'GreenFlag_Live'
  AND source_schema = 'dbo'
  AND source_table = 'EmailLog'
ON CONFLICT (catalog_id, mapping_version) DO UPDATE SET
  required_target_entity_types = EXCLUDED.required_target_entity_types,
  optional_target_entity_types = EXCLUDED.optional_target_entity_types,
  archive_required = EXCLUDED.archive_required,
  allow_unlinked_source = EXCLUDED.allow_unlinked_source,
  missing_target_severity = EXCLUDED.missing_target_severity,
  rule_status = EXCLUDED.rule_status,
  notes = EXCLUDED.notes,
  updated_at_utc = now();

INSERT INTO migration_mapping_rules (
  id,
  catalog_id,
  source_group,
  mapping_version,
  required_target_entity_types,
  optional_target_entity_types,
  archive_required,
  allow_unlinked_source,
  missing_target_severity,
  rule_status,
  notes
)
SELECT
  CASE source_table
    WHEN 'InvoicingOrganisation' THEN '23000000-0000-4000-8000-000000000105'
    ELSE '23000000-0000-4000-8000-000000000106'
  END::uuid,
  id,
  source_group,
  'goal-2-finance-migration.v1',
  ARRAY[]::text[],
  ARRAY['organisation', 'archive_record'],
  true,
  false,
  'warning',
  'active',
  'Legacy invoicing organisation/team content is archive-first until finance/product ownership approves any runtime use.'
FROM migration_source_table_catalog
WHERE source_system = 'legacy_greenflag_live'
  AND source_database = 'GreenFlag_Live'
  AND source_schema = 'dbo'
  AND source_table IN ('InvoicingOrganisation', 'InvoicingOrganisationTeam')
ON CONFLICT (catalog_id, mapping_version) DO UPDATE SET
  required_target_entity_types = EXCLUDED.required_target_entity_types,
  optional_target_entity_types = EXCLUDED.optional_target_entity_types,
  archive_required = EXCLUDED.archive_required,
  allow_unlinked_source = EXCLUDED.allow_unlinked_source,
  missing_target_severity = EXCLUDED.missing_target_severity,
  rule_status = EXCLUDED.rule_status,
  notes = EXCLUDED.notes,
  updated_at_utc = now();

-- migrate:down

DELETE FROM migration_mapping_rules
WHERE mapping_version = 'goal-2-finance-migration.v1';

DELETE FROM migration_source_table_catalog
WHERE source_system = 'legacy_greenflag_live'
  AND source_database = 'GreenFlag_Live'
  AND source_schema = 'dbo'
  AND source_table IN ('InvoicingOrganisation', 'InvoicingOrganisationTeam');

DELETE FROM migration_target_entity_types
WHERE code IN ('fee_schedule', 'fee_schedule_line', 'invoice_line', 'payment_event', 'finance_export_run');

DROP TRIGGER IF EXISTS invoices_finance_facts_no_update ON invoices;
DROP FUNCTION IF EXISTS prevent_invoice_finance_fact_mutation();
DROP TRIGGER IF EXISTS payment_events_no_update ON payment_events;
DROP FUNCTION IF EXISTS prevent_payment_event_mutation();
DROP TRIGGER IF EXISTS invoice_lines_no_update ON invoice_lines;
DROP FUNCTION IF EXISTS prevent_invoice_line_mutation();

DROP INDEX IF EXISTS idx_finance_export_runs_status;
DROP INDEX IF EXISTS idx_finance_export_runs_job;
DROP TABLE IF EXISTS finance_export_runs;

DROP INDEX IF EXISTS idx_payment_events_type_status;
DROP INDEX IF EXISTS idx_payment_events_invoice_occurred;
DROP TABLE IF EXISTS payment_events;

DROP INDEX IF EXISTS idx_invoice_lines_area_snapshot;
DROP INDEX IF EXISTS idx_invoice_lines_fee_schedule_line;
DROP INDEX IF EXISTS idx_invoice_lines_invoice;
DROP TABLE IF EXISTS invoice_lines;

DROP INDEX IF EXISTS idx_invoices_application_episode_finance;
DROP INDEX IF EXISTS idx_invoices_finance_status_due;
DROP INDEX IF EXISTS ux_invoices_invoice_number_scope_number;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_total_amounts_match_check,
  DROP COLUMN IF EXISTS source_reference_metadata,
  DROP COLUMN IF EXISTS legacy_import_reference,
  DROP COLUMN IF EXISTS correction_metadata,
  DROP COLUMN IF EXISTS status_reason,
  DROP COLUMN IF EXISTS superseded_by_invoice_id,
  DROP COLUMN IF EXISTS cancelled_at_utc,
  DROP COLUMN IF EXISTS voided_at_utc,
  DROP COLUMN IF EXISTS paid_at_utc,
  DROP COLUMN IF EXISTS sent_at_utc,
  DROP COLUMN IF EXISTS generated_at_utc,
  DROP COLUMN IF EXISTS due_date_override_reason,
  DROP COLUMN IF EXISTS payment_terms_config_id,
  DROP COLUMN IF EXISTS due_date_source,
  DROP COLUMN IF EXISTS payment_terms_snapshot,
  DROP COLUMN IF EXISTS tax_rate,
  DROP COLUMN IF EXISTS tax_name,
  DROP COLUMN IF EXISTS total_amount,
  DROP COLUMN IF EXISTS tax_amount,
  DROP COLUMN IF EXISTS subtotal_amount,
  DROP COLUMN IF EXISTS currency_precision,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS no_purchase_order_declared_snapshot,
  DROP COLUMN IF EXISTS purchase_order_number_snapshot,
  DROP COLUMN IF EXISTS billing_region,
  DROP COLUMN IF EXISTS billing_postcode,
  DROP COLUMN IF EXISTS billing_address_line3,
  DROP COLUMN IF EXISTS billing_address_line2,
  DROP COLUMN IF EXISTS billing_address_line1,
  DROP COLUMN IF EXISTS billing_phone,
  DROP COLUMN IF EXISTS billing_email,
  DROP COLUMN IF EXISTS billing_contact_name,
  DROP COLUMN IF EXISTS billing_name,
  DROP COLUMN IF EXISTS organisation_name_snapshot,
  DROP COLUMN IF EXISTS park_name_snapshot,
  DROP COLUMN IF EXISTS organisation_id,
  DROP COLUMN IF EXISTS park_id,
  DROP COLUMN IF EXISTS invoice_number_policy_snapshot,
  DROP COLUMN IF EXISTS invoice_number_scope,
  DROP COLUMN IF EXISTS invoice_number;

DROP INDEX IF EXISTS idx_fee_schedule_lines_lookup;
DROP TABLE IF EXISTS fee_schedule_lines;

DROP INDEX IF EXISTS idx_fee_schedules_active_lookup;
DROP TABLE IF EXISTS fee_schedules;
