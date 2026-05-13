# Goal 2 Finance Migration Coverage Plan

Status: PLAN ONLY for Backend Track A Goal 2.

This document plans finance migration coverage for legacy replacement readiness. It intentionally does not implement code, edit migrations, edit contracts, edit services, edit tests, or touch frontend/UI files.

## Executive recommendation

Goal 2 should add a modern finance domain layer that can preserve, import, reconcile, and operate historical and current finance facts without copying the old `Fee` or `Invoice` table shapes.

The recommended implementation is:

1. Keep the existing manual/offline MVP posture for payment operations.
2. Add configurable `fee_schedules` and `fee_schedule_lines` with effective dates, applicability rules, currency, and tax snapshots, seeded only with lower-env placeholders unless KBT Finance supplies approved production inputs.
3. Expand invoice support from a placeholder shell into invoice headers, invoice-numbering controls, billing/legal snapshots, payment-terms snapshots, invoice lines, totals, tax/currency snapshots, and historical import metadata.
4. Add append-only `payment_events` while retaining compatibility with current `payment_states`.
5. Add a finance export boundary that supports CSV/manual export first, with Business Central reference/status fields ready for later adapter integration.
6. Use the Goal 1 migration reference/reconciliation layer for all legacy `Fee`, `Invoice`, `ParkAwardApplication`, `InvoicingOrganisation`, `InvoicingOrganisationTeam`, and relevant `EmailLog` provenance.
7. Use Goal 5 `application_area_snapshots` as the only area input for fee matching at invoice time, so historic invoice totals are not recalculated from later park-area changes.

Acceptance for Goal 2 should be "migration-safe finance coverage", not full automation. Stripe/webhook automation, production Business Central API calls, approved VAT/legal wording, and production fee values remain external gates.

## Existing repo evidence

Current invoice/payment tables and columns:

- `packages/db/migrations/0007_submission_invoice_po_payment_state.sql` creates `application_submissions`, `invoices`, `payment_states`, and `payment_notification_intents`.
- Current `invoices` columns are `id`, `application_id`, `assessment_episode_id`, `status`, `amount_marker`, `due_at`, `available_in_portal`, `created_at`, and `updated_at`.
- Current invoice status values are `PENDING`, `PAID`, `OVERDUE_BLOCKED`, and `WAIVED`.
- `amount_marker` is always the placeholder `external_value_unavailable`; there is no currency, subtotal, VAT/tax, total, invoice number, billing snapshot, invoice line, sent timestamp, paid timestamp, void/cancel/superseded support, or legacy source link in the domain table.
- Current `payment_states` columns are `invoice_id`, `purchase_order_number`, `no_purchase_order_declared`, `manually_marked_paid`, `manual_paid_by_actor_id`, `manual_paid_reason`, `manual_paid_at`, `override_applied`, `override_by_actor_id`, `override_reason`, `override_at`, `blocked_for_allocation`, and `updated_at`.
- The `payment_states` check constraint enforces exactly one of `purchase_order_number` or `no_purchase_order_declared`.
- Current `payment_notification_intents` stores `application_submitted_email`, `invoice_available_email`, and `payment_overdue_email` intent markers only.

Current invoice generation behavior:

- `apps/api/src/postgres-domain-stores/applicant-repository.ts` creates an invoice on application submission with `status = 'PENDING'`, `amount_marker = 'external_value_unavailable'`, `due_at = now + 30 days`, and `available_in_portal = true`.
- The lower-env map-backed route mirrors this behavior in `apps/api/src/applicant/routes.ts`.
- Submission also moves the assessment episode to `PAYMENT_PENDING`, records `application_submissions`, inserts `payment_states`, adds notification intents, and emits audit actions `SUBMIT_APPLICATION` and `CREATE_INVOICE_FOR_SUBMISSION`.

Current PO/no-PO behavior:

- `packages/contracts/src/schemas.ts` models `purchaseOrderNumber` or `noPurchaseOrderDeclared` via `purchaseOrderPreferenceSchema`.
- Submit requires this preference and stores it in `payment_states`.
- `PATCH /api/v1/applicant/applications/:applicationId/purchase-order` updates the preference and audits `RECORD_PURCHASE_ORDER_PREFERENCE`.
- Existing tests cover PO entry, no-PO declaration, and post-submission PO update.

Current manual mark-paid behavior:

- `POST /api/v1/admin/payments/:invoiceId/mark-paid` sets `invoices.status = 'PAID'`, sets the episode to `READY_FOR_ALLOCATION`, marks `payment_states.manually_marked_paid = true`, records actor/reason/time, clears allocation blocking, and audits `MARK_PAYMENT_PAID_MANUALLY`.
- `POST /api/v1/admin/payments/:invoiceId/override-block` sets `invoices.status = 'WAIVED'`, clears blocking, sets the episode to `READY_FOR_ALLOCATION`, records override actor/reason/time, writes `admin_override_events`, and audits `OVERRIDE_PAYMENT_BLOCK`.
- Runtime safety explicitly allows `PAYMENT_RUNTIME_MODE=manual_mvp` as the current production-like payment posture.

Current payment overdue/blocking behavior:

- `POST /api/v1/admin/payments/deadline-check` finds pending invoices with `due_at < asOf`, sets invoice status to `OVERDUE_BLOCKED`, sets episode status to `PAYMENT_OVERDUE_BLOCKED`, sets `payment_states.blocked_for_allocation = true`, and audits `APPLY_PAYMENT_OVERDUE_BLOCK`.
- Admin queue read models treat pending and overdue payments as attention flags, and allocation readiness requires submitted application, complete document state, and `PAID` or `WAIVED` payment status.

Current export/Business Central boundary:

- `packages/db/migrations/0014_notifications_messaging_jobs_exports_reminders.sql` creates `export_jobs` with `export_type` including `payments`, `format` as `csv` or `json`, `status`, `redaction_profile`, lower-env storage fields, requester, and timestamps.
- `packages/db/migrations/0020_closeout_pass_b_retry_runtime_ci.sql` adds `dedupe_key` and uniqueness for export retries.
- `POST /api/v1/admin/exports` creates generic exports; Finance Admins can create only `payments` exports.
- Storage provider is `lower_env_stub`. There is no Business Central payload table, BC reference, BC status, error history, or export reconciliation model.

Current notification/payment email behavior:

- Payment submission/invoice availability is represented as `payment_notification_intents`, not real provider dispatch.
- Slice 13 adds generic `notification_queue`, `notification_logs`, and `notification_suppressions`, but current payment submission does not appear to enqueue provider-ready finance notifications.
- Email provider configuration, templates, and approved copy remain external.

Current gaps against legacy migration and production finance needs:

- No fee schedule or fee line schema.
- No production fee values, currency, VAT/tax treatment, due-date policy, invoice numbering, or legal invoice wording.
- No invoice billing snapshot for park, organisation, contact, email, phone, billing name, or billing address.
- No invoice lines or fee schedule line references.
- No numeric invoice subtotal, tax amount, or total.
- No append-only payment event log for manual, provider, import, override, failure, refund, or reconciliation events.
- No direct Business Central/export status/reference/error model beyond generic payment export jobs.
- No legacy `Fee` or `Invoice` target mapping beyond Goal 1 sidecar catalog seeds.
- No reconciliation for fee/invoice row counts, totals, VAT, currency, country/season groups, missing targets, duplicates, or total mismatches.
- No finance use of Goal 5 `application_area_snapshots` yet.

## Proposed schema/model corrections

Do not copy the legacy `Fee` or `Invoice` tables. Add modern finance tables that can preserve historical facts, support current operations, and link to Goal 1 provenance through sidecar `migration_entity_links`.

### Fee schedules

Add `fee_schedules`:

- `id`
- `schedule_key`
- `name`
- `version`
- `status`: `draft`, `active`, `inactive`, `superseded`, `voided`
- `effective_from`
- `effective_to`
- `country_code` or nullable global applicability
- explicit pricing scope fields such as `country_code`, `operator_scope_code`, `finance_scope_key`, or another approved scope discriminator
- optional `operator_organisation_id` only where organisation-specific pricing is explicitly approved
- optional `award_track_code` and future `award_category_id`
- `currency`
- `tax_name`
- `tax_rate`
- `tax_configuration_snapshot` as sanitized JSON for approved finance config only
- `approved_by_actor_id`
- `approved_at_utc`
- `created_at_utc`
- `updated_at_utc`
- lower-env seed marker such as `configuration_source = 'lower_env_placeholder' | 'kbt_finance_approved' | 'legacy_import'`

Planning rules:

- Production activation requires approved KBT Finance seed/config.
- Lower-env seeds may use synthetic placeholder schedules but must not contain real-looking production fees, VAT wording, or legal text.
- Existing `packages/db/scripts/check-seeds.mjs` forbids tokens such as `vat`, `invoice wording`, provider secrets, API keys, score bands, official criteria, and KBT approval. Goal 2 implementation should preserve that safety posture or extend it carefully.
- Managing organisation is not automatically the same as finance/operator pricing scope. Fee lookup should use `country_code` and explicit approved pricing scope fields first; organisation-specific pricing should be enabled only after product/KBT Finance approval.

### Fee schedule lines

Add `fee_schedule_lines`:

- `id`
- `fee_schedule_id`
- `line_code`
- `description`
- `award_track_code`
- optional `award_category_id`
- optional `country_code`
- explicit pricing scope fields matching `fee_schedules`
- optional `operator_organisation_id` only where approved
- size band columns such as `min_area_hectares`, `max_area_hectares`, and `legacy_hectare_marker`
- `unit_amount`
- `currency`
- `tax_name`
- `tax_rate`
- `is_tax_inclusive` if approved by KBT Finance
- `line_status`
- `created_at_utc`
- `updated_at_utc`

Applicability should support:

- Country.
- Explicit country/operator pricing scope where approved.
- Organisation-specific pricing only where product/KBT Finance explicitly approves it; do not infer pricing from the managing organisation relationship alone.
- Track/category, including Standard, Heritage, Community, and Innovation as configurable applicability, not copied legacy columns.
- Area/hectare bands selected from Goal 5 `application_area_snapshots.area_hectares`.
- Effective dates and versioning by invoice generation time.

Legacy `Fee` mapping:

- `Fee.CountryID` maps through country/reference migration rules to schedule or line applicability.
- `Fee.Hectare` maps to a source band marker until dry-run data confirms whether it is an upper bound, threshold, exact hectare, or row ordering convention.
- `Fee.Price`, `Fee.HeritageFee`, `Fee.CommunityFee`, and `Fee.InnovationFee` map to separate fee schedule lines or line variants by track/category.
- `Fee.Currency`, `Fee.Vat`, and `Fee.VatName` map to currency/tax snapshots.
- `Fee.IsActive`, `DateCreated`, and `DateUpdated` inform schedule/line status and effective/version metadata.
- Source rows link through Goal 1 `migration_entity_links` to `fee_schedule` and/or `fee_schedule_line` target entity types added in Goal 2.

### Invoice headers and legal/billing snapshots

Extend or version the existing `invoices` model so each invoice has immutable invoice-time facts:

- `invoice_number`
- `application_id`
- `assessment_episode_id`
- `park_id`
- `organisation_id`
- `billing_name`
- `billing_contact_name`
- `billing_email`
- `billing_phone`
- billing address snapshot fields: line 1, line 2, line 3, town/locality if available, region, postcode, country
- `purchase_order_number`
- `no_purchase_order_declared`
- `currency`
- `subtotal_amount`
- `tax_amount`
- `total_amount`
- `tax_name`
- `tax_rate`
- `due_at`
- `payment_terms_snapshot`
- `due_date_source`: `cycle_config`, `finance_config`, `legacy_import`, `manual_override`, or `lower_env_placeholder`
- `payment_terms_config_id` where applicable
- `due_date_override_reason`
- `status`
- `generated_at_utc`
- `sent_at_utc`
- `paid_at_utc`
- `voided_at_utc`
- `cancelled_at_utc`
- `superseded_by_invoice_id`
- `status_reason`
- `available_in_portal`
- sanitized `legal_configuration_snapshot` or `invoice_wording_snapshot` only when approved by KBT Finance/legal; otherwise use a marker that production wording is external/manual.

Historical invoice snapshots must preserve what was true at invoice time and must never recalculate from later park, organisation, contact, billing-address, tax, or area changes.

Invoice numbering safety:

- `invoice_number` must be unique within the approved finance numbering scope. The implementation should define the scope explicitly, for example global, country/year, or finance-entity/year, only after KBT Finance confirms the policy.
- Invoice-number generation must be idempotent for retries of the same invoice-generation command and must not skip or duplicate numbers because of API retries.
- Imported legacy invoices may preserve the legacy invoice identifier/reference as an imported invoice number or separate imported reference according to KBT Finance migration rules; collisions must create reconciliation items rather than silent renumbering.
- Lower-env numbering may use clearly synthetic placeholders that cannot be confused with production invoice numbers.
- Production invoice-number format, sequence boundaries, prefixes, reset rules, and legal requirements require KBT Finance approval. Do not invent a production invoice-number format.

Due-date and payment-terms safety:

- `due_at` must be an immutable invoice-time snapshot, not a live calculation.
- The deadline source may be cycle config, finance config, imported legacy value, or a manual override with reason and audit.
- The current `now + 30 days` behavior is a lower-env placeholder only and must not become permanent production logic.
- Payment terms should be snapshotted on the invoice so later changes to finance configuration or cycle dates do not alter issued/imported invoices.

Existing invoice compatibility:

- Implementation should be additive. Keep `amount_marker` unless all current contracts, OpenAPI schemas, fixtures, tests, and read models are safely updated in the same implementation pass.
- Backfill new numeric fields beside existing placeholder fields and preserve existing invoice/payment read-model behavior during transition.
- Existing applicant/admin payment summaries should continue to work while richer finance fields are introduced behind implementation-time contract review.

Legacy `Invoice` mapping:

- `Invoice.ID` maps to Goal 1 source record and a confirmed `invoice` entity link.
- `Invoice.ParkAwardApplicationID` maps via Goal 1 to the modern `application` and `assessment_episode`.
- `Invoice.ParkName`, `OrganisationName`, `Region`, `ContactName`, `ContactTelNo`, `Email`, `FeeInvoiceName`, `FeeInvoiceAddressLine1`, `FeeInvoiceAddressLine2`, `FeeInvoiceAddressLine3`, and `FeeInvoicePostcode` map to invoice snapshot fields.
- `Invoice.PurchaseOrderNumber` maps to both invoice snapshot and current `payment_states` compatibility where appropriate.
- `Invoice.TotalCost` maps to immutable invoice total.
- `Invoice.DateCreated` maps to `generated_at_utc` or imported creation timestamp.

Legacy `ParkAwardApplication` mapping:

- `ParkAwardApplication.TotalCost` maps to reconciliation evidence and may map to invoice total only when no separate `Invoice` row exists and KBT approves fallback rules.
- `ParkAwardApplication.PurchaseOrderReference` maps to invoice/payment PO snapshot where no `Invoice.PurchaseOrderNumber` supersedes it.
- ParkAwardApplication invoice address fields map to billing snapshot fields when imported invoice rows lack them or for mismatch reporting.

### Invoice lines

Add `invoice_lines`:

- `id`
- `invoice_id`
- optional `fee_schedule_line_id`
- `description`
- `quantity`
- `unit_amount`
- `currency`
- `tax_name`
- `tax_rate`
- `tax_amount`
- `line_subtotal`
- `line_total`
- `application_area_snapshot_id` where line selection used area/hectare band matching
- `source_reference_metadata` sanitized JSON for imported/historical line derivation
- `created_at_utc`

Planning rules:

- Invoice totals should be derived from lines at generation time and then frozen.
- Imported legacy invoices may have synthetic single-line reconstruction from `Invoice.TotalCost` only as historical preservation, with source metadata recording that line detail was unavailable.
- Imported legacy `Fee` rows should link to fee schedule lines; imported legacy `Invoice` rows should link to invoices and lines.
- Issued or imported invoice lines must not be silently mutated after issue/import. Corrections should use supersede, void, cancel, or explicit correction-event flows.

Deterministic arithmetic rules:

- Store money amounts in fixed-precision numeric columns, not binary floating-point.
- Currency precision must come from approved currency metadata, with a safe default such as ISO minor units only if implementation-time review confirms it.
- Line subtotal should be calculated deterministically from `quantity * unit_amount` using the currency precision and approved rounding mode.
- Tax amount should be calculated from the frozen line subtotal and frozen tax rate/tax treatment snapshot using the approved rounding mode.
- Invoice subtotal should equal the sum of frozen line subtotals.
- Invoice tax amount should equal the sum of frozen line tax amounts unless KBT Finance approves invoice-level tax rounding.
- Invoice total should equal invoice subtotal plus invoice tax amount, or the approved tax-inclusive equivalent if KBT Finance supplies that treatment.
- Do not invent VAT rates, tax-inclusive/exclusive treatment, or production rounding policy.

### Payment events and payment state

Add append-only `payment_events` while preserving current `payment_states` as the latest-state projection:

- `id`
- `invoice_id`
- `event_type`: `manual_mark_paid`, `payment_override`, `deadline_block_applied`, `provider_event_placeholder`, `legacy_import`, `exported`, `export_failed`, `refund_placeholder`, `voided`, `reconciled`
- `event_status`: `received`, `accepted`, `rejected`, `superseded`, `requires_review`
- `amount`
- `currency`
- `payment_method`: `manual`, `bank_transfer`, `card_provider`, `purchase_order`, `legacy_import`, `unknown`
- `source`: `admin_action`, `provider_webhook`, `legacy_import`, `system_job`, `finance_export`
- `actor_id`
- `occurred_at_utc`
- `provider`
- `provider_reference`
- sanitized `provider_payload_metadata`
- `audit_event_id`
- `admin_override_event_id`
- `notes`

Planning rules:

- Manual mark-paid remains MVP and should emit a `manual_mark_paid` event.
- Existing `payment_states` columns remain compatibility/latest-state fields unless an implementation-time migration chooses a projection table with the same API behavior.
- Provider payload metadata must never store plaintext credentials, card data, webhook secrets, or raw sensitive payloads.
- Stripe/webhook automation is not required for Goal 2; only placeholder event shape and safe storage boundaries are planned.
- Imported legacy payment/history data, where it exists, should use `legacy_import` events and Goal 1 provenance.
- `payment_events` must be append-only. If repo convention supports it, add database triggers or constraints that prevent update/delete of accepted event rows.
- Current payment state changes should be represented by new events plus projection updates, not by rewriting historical event evidence.

### Finance immutability and correction flows

Finance facts should be correction-by-new-record or correction-by-new-event:

- Issued/imported invoice headers, totals, tax snapshots, payment-terms snapshots, and invoice lines are frozen.
- Manual corrections must create supersede, void, cancel, or correction events with reason, actor, timestamp, and audit linkage.
- A replacement invoice should reference the superseded invoice instead of mutating historical totals.
- Imported invoices should preserve legacy facts even where modern fee schedule logic would produce a different amount.
- Reconciliation mismatches should create report items and optional correction workflow entries, not silent data repair.

### Finance export and Business Central boundary

Add a finance-specific export model or extend generic `export_jobs` with finance details:

- `finance_export_runs` or `finance_export_events`
- `id`
- `export_job_id` where using the existing generic export shell
- `export_type`: `invoice_csv`, `payment_csv`, `business_central_invoice`, `business_central_payment`
- `status`: `requested`, `generated`, `sent_manual`, `sent_adapter`, `acknowledged`, `failed`, `requires_review`, `voided`
- `format`: `csv`, `json`, `api_payload_placeholder`
- `invoice_id` or batch scope fields
- `business_central_reference`
- `business_central_status`
- `business_central_error_code`
- `business_central_error_detail`
- `exported_at_utc`
- `acknowledged_at_utc`
- `requested_by_actor_id`
- `storage_key`
- `reconciliation_summary`

Planning rules:

- CSV/manual export is the MVP-safe path.
- Business Central API credentials and payload contract are not required for Goal 2 and must not be hardcoded.
- Export reconciliation should compare exported invoice/payment counts and totals back to invoice/payment tables and, for migration rehearsals, Goal 1 source totals.

## Proposed service/repository changes

Fee schedule services:

- Add a fee schedule repository for active/effective schedule lookup by application, episode, country, operator, track/category, and invoice date.
- Add a fee line resolver that uses `application_area_snapshots` to select size/hectare bands.
- Add lower-env placeholder behavior that can create safe invoice shells without production values, and fail closed for production unless KBT Finance config is approved or `INVOICE_RUNTIME_MODE=manual_offline` is explicitly enabled.

Invoice services:

- Replace placeholder-only invoice creation with an invoice generation service that freezes invoice header, billing snapshot, tax/currency snapshot, area snapshot reference, invoice lines, and totals.
- Add an invoice-number generator that is scoped, unique, idempotent, and configurable, with production policy supplied by KBT Finance.
- Add a due-date/payment-terms resolver that snapshots the source policy at invoice time and supports cycle config, finance config, legacy import, and manual override sources.
- Support historical import mode that preserves imported invoice facts and avoids recalculating totals.
- Support void/cancel/supersede only if needed for finance correctness; otherwise keep these as planned status fields for later.
- Preserve existing submit, payment summary, manual mark-paid, override, and deadline behaviors.

Payment services:

- Emit `payment_events` for manual mark-paid, payment override, overdue block, and legacy import events.
- Maintain `payment_states` as a latest-state projection for existing endpoints/read models.
- Keep provider events as placeholders until Stripe/provider automation is explicitly approved.

Finance export services:

- Keep `export_jobs` as the generic job shell.
- Add finance export generation for CSV/manual export with status/reference records.
- Add optional Business Central reference/status/error fields without requiring an API adapter.
- Add export reconciliation jobs for counts and totals.

Migration/reconciliation services:

- Register new Goal 2 target entity types for `fee_schedule`, `fee_schedule_line`, `invoice_line`, `payment_event`, and finance export entities.
- Register active mapping rules for `Fee`, `Invoice`, and finance-related `ParkAwardApplication` fields.
- Generate finance reconciliation reports using Goal 1 report/report-item tables with `report_type = 'finance_totals'`, `count`, `duplicate`, `missing_target`, `orphan_source`, and `cross_entity`.

Audit/RBAC:

- Continue append-only audit for invoice generation, PO/no-PO updates, manual mark-paid, overrides, deadline blocks, export creation, export acknowledgement/failure, and reconciliation item resolution.
- Keep Finance Admin scoped to payment/finance operations; Super Admin remains required for payment-block override.

## Proposed contract/API/read-model changes

These are planning items only. Any DTO/OpenAPI changes require implementation-time contract review.

Applicant read models:

- Expand applicant invoice/payment summary only as needed to show safe invoice status, due date, currency/total if approved/configured, invoice availability, PO/no-PO state, and manual/offline payment status.
- Do not expose migration provenance, source IDs, source-table names, Business Central internals, provider payload metadata, raw audit actor IDs, or Mystery metadata.
- Goal 2 stores invoice facts, snapshots, lines, totals, payment events, and exportable/read-model data. PDF/artifact rendering should remain shell/manual/offline unless an approved invoice artifact path already exists.
- Any generated invoice artifact/document integration should coordinate with Goal 3 so document storage, retention, provenance, signed access, and archive behavior remain consistent.

Admin finance read models:

- Expand admin payment queue to include invoice number, park, organisation, billing contact summary, currency, total, due date, status, PO/no-PO, manual mark-paid state, overdue/block state, export status, and reconciliation warning flags.
- Add admin invoice detail/read model for finance users and Super Admins.
- Add finance export endpoint/job fields for `payments` and `invoices` CSV/manual export, plus later Business Central status/reference placeholders.
- Preserve existing manual mark-paid endpoint and payment override endpoint, adding event/reference fields only after contract review.

Migration/admin read models:

- Internal/go-live evidence endpoints or reports may expose migration provenance only to explicitly authorized migration/admin roles.
- Applicant, judge, public, and ordinary operational DTOs must not expose Goal 1 provenance.

No frontend implementation is included in Goal 2 planning.

## Goal 1 migration-layer usage

Goal 2 should use Goal 1 as a sidecar provenance and reconciliation layer, not as runtime finance authority.

Required usage:

- `migration_source_table_catalog`: existing seeds cover `Fee`, `Invoice`, and `EmailLog`; Goal 2 should add/confirm catalog coverage for `InvoicingOrganisation`, `InvoicingOrganisationTeam`, and any finance-relevant `ParkAwardApplication` source-field groups if not already classified.
- `migration_import_batches`: every dry run, UAT rehearsal, cutover, and rollback rehearsal records source export metadata.
- `migration_import_batch_source_tables`: store expected row counts and hashes for `Fee`, `Invoice`, `ParkAwardApplication`, `InvoicingOrganisation`, `InvoicingOrganisationTeam`, and relevant `EmailLog` exports.
- `migration_mapping_rules`: active rules define required targets for `Fee` and `Invoice`, optional/archive targets for billing/content and email logs, and `legacy-field-mapping.v1` where the Goal 5 manifest applies.
- `migration_source_records`: register each source row with sanitized fingerprints, not raw unrestricted row payloads.
- `migration_entity_links`: link `Fee` to `fee_schedule`/`fee_schedule_line`; `Invoice` to `invoice`/`invoice_line`/`payment_state`/`payment_event` where applicable; `ParkAwardApplication` to `application`, `assessment_episode`, `application_area_snapshot`, and invoice/payment targets where applicable.
- `migration_archive_records`: archive-only finance/content fields, raw legal/copy text, raw EmailLog bodies, and unapproved public/operator content stay here or in external archive manifests.
- `migration_reconciliation_reports` and `migration_reconciliation_report_items`: produce finance count/totals/missing/orphan/duplicate/mismatch evidence and resolve items with audit.

Reconciliation coverage:

- `Fee` row counts by import batch.
- `Invoice` row counts by import batch.
- Invoice total reconciliation: legacy `Invoice.TotalCost` against target invoice totals.
- VAT/tax reconciliation: legacy `Fee.Vat`/`VatName` and target tax snapshots/tax totals.
- Currency grouping across source and target.
- Country grouping using `Fee.CountryID`, `Invoice`/application country, and target country/cycle mappings.
- Season/operational-year grouping using `ParkAwardApplication.SeasonYear`, `CountrySeason`, `assessment_episodes.operational_year`, and `source_cycle_id`.
- Missing invoice targets for registered legacy invoice rows.
- Duplicate invoice detection by source `Invoice.ID`, application, invoice number, natural key, and total/date combinations.
- Orphan `Fee` rows with no schedule/line target or no applicable country/cycle mapping.
- Orphan `Invoice` rows with no application/episode target.
- Source-to-target traceability for every migrated finance source row.
- Target-to-source traceability for every imported historical finance target row.
- Mismatches between `ParkAwardApplication.TotalCost` and `Invoice.TotalCost`.
- Missing billing snapshots on target invoices.
- Missing `application_area_snapshots` for fee matching.
- Reconciliation items for cases where imported legacy `ParkAwardApplication.ParkSize` and `Park.ParkSize` conflict.

## Goal 5 area snapshot usage

Goal 2 must consume `application_area_snapshots` for fee matching.

Rules:

- Invoice generation must select fee schedule lines using `application_area_snapshots.area_hectares`, not current `park_area_measurements`.
- If no application area snapshot exists at submission/invoice generation, the command should fail closed or create the snapshot as part of the same transaction using the approved Goal 5 area service behavior.
- Historical invoice import must preserve imported invoice totals even if the imported area is missing, ambiguous, or later corrected.
- Later `park_area_measurements` admin overrides must not change existing invoice headers, invoice lines, tax snapshots, totals, or payment state.
- Legacy `ParkAwardApplication.ParkSize` should map to `application_area_snapshots` with `source_kind = legacy_import`.
- Legacy `Park.ParkSize` should map to `park_area_measurements` with `source_kind = legacy_import`.
- Conflicts between legacy application area and park current area should create reconciliation items, not silently change finance totals.

Required protection:

- Historic invoice totals remain frozen.
- Application-time area is never recalculated from the current park area.
- Imported legacy `ParkAwardApplication.ParkSize` and `Park.ParkSize` conflicts are visible in reconciliation.

## Proposed tests

Schema/migration tests:

- Migration convention and clean apply include Goal 2 finance tables/indexes/constraints.
- `fee_schedules` and `fee_schedule_lines` enforce version/effective-date/status constraints.
- Invoice header totals, currency, tax snapshot, billing snapshot, and line records are present for non-placeholder config.
- `payment_events` is append-only and stores no sensitive provider secrets.
- Goal 1 target entity types include Goal 2 finance targets.

Service/repository tests:

- Invoice generated on application submission.
- Invoice lines are created from fee schedule/config.
- Invoice snapshot preserves billing, park, organisation, and contact details.
- `application_area_snapshot` is used for fee matching.
- Later area override does not alter historic invoice lines or totals.
- PO/no-PO workflow remains exactly-one-of and can be updated with audit.
- Manual mark-paid emits payment event and audit.
- Manual mark-paid and provider/import/payment events are append-only, with no update/delete path for accepted event evidence where database conventions support enforcement.
- Payment overdue/blocking behavior remains intact.
- Super Admin override remains audited and emits payment event/admin override evidence.
- Fee schedule versioning/effective dates choose the correct active schedule.
- VAT/currency snapshot preservation.
- Rounding and decimal arithmetic are deterministic for line subtotals, tax amounts, invoice subtotals, and invoice totals.
- Invoice numbering is unique, idempotent on retries, safe for import collisions, and lower-env placeholder-only until KBT Finance approves production policy.
- Due dates and payment terms are snapshotted and can come from cycle config, finance config, legacy import, or manual override with audit.
- Placeholder/lower-env config remains safe and production-like runtime fails closed without approved config or manual/offline mode.

Migration/reconciliation tests:

- Legacy `Fee` source rows map through Goal 1 to fee schedules/lines.
- Legacy `Invoice` source rows map through Goal 1 to invoices/lines/payment state/events.
- Finance reconciliation reports cover counts, totals, missing targets, orphan source rows, duplicates, VAT/tax totals, currency grouping, country grouping, and season grouping.
- Mismatch between `ParkAwardApplication.TotalCost` and `Invoice.TotalCost` creates report items.
- Missing billing snapshots create report items.
- Missing `application_area_snapshots` for fee matching creates report items.
- Source-to-target and target-to-source traceability works for `Fee`, `Invoice`, and imported invoice lines/payment events.

Export/API/read-model tests:

- Business Central/CSV export boundary creates export status/reference records without requiring Business Central credentials.
- Finance export reconciliation compares exported invoice/payment counts and totals.
- Applicant invoice read model does not expose migration provenance.
- Admin invoice/payment queue shows finance-safe status fields.
- Finance Admin cannot create non-payment/non-finance exports and cannot access unrelated operational exports.

Security/redaction tests:

- Mystery redaction remains safe where finance notifications/status could leak episode type.
- Applicant/judge/public DTOs do not expose migration source IDs, source-table names, Business Central references, provider payload metadata, or raw audit internals.
- Notification/payment email projection does not expose raw Mystery metadata.

Regression tests:

- Existing manual mark-paid, override, deadline block, idempotent submit replay, and audit rollback tests remain green.
- Existing contracts that intentionally omit VAT/legal wording continue to pass until implementation-time contract review approves new fields.

## Risks / open decisions

- KBT Finance must supply approved fee schedules, country/operator applicability, VAT/tax treatment, due-date policy, invoice numbering, and invoice/legal wording before production invoice generation.
- Business Central data contract, payload shape, credentials, acknowledgement/error semantics, and reconciliation ownership remain open.
- Stripe/payment provider automation, webhook signatures, replay rules, refunds, and card-flow signoff remain deferred.
- Legacy `Fee.Hectare` semantics must be verified from actual exports before mapping to size bands.
- Legacy invoices may not contain enough line-level detail; single-line historical reconstruction may be required and must be labelled as imported/reconstructed evidence.
- Legacy `InvoicingOrganisation` and `InvoicingOrganisationTeam` may include finance config, operator public content, guidance, logos, and team content. Ownership must be classified before any runtime use.
- Legacy `EmailLog` may contain invoice/payment delivery evidence, but raw body/error content can include personal data and must be archive-only unless KBT/legal approves a safe import view.
- Invoice PDF/artifact generation is not automatically in scope unless an approved manual/offline artifact process exists.
- Invoice artifact/document integration should be coordinated with Goal 3 if rendered invoice files become in-scope.
- Production legal invoice wording must not be inferred from old content or test fixtures.
- Refunds, credit notes, partial payments, multi-currency settlement, and provider disputes are not MVP unless KBT Finance explicitly adds them.
- Some finance-adjacent decisions may belong to Goal 3 or Goal 4 if they depend on document archive or contact/person migration.

## Items blocked by KBT Finance or external input

- Production fee values.
- VAT/tax rate, tax name, tax-inclusive/exclusive treatment, and legal invoice wording.
- Invoice numbering policy and legal/company identity details.
- Due-date policy by country/cycle/operator.
- Business Central API/data contract, credentials, mapping, status lifecycle, and reconciliation process.
- Payment provider/Stripe account, keys, webhook signatures, replay policy, refunds, and online card-flow signoff.
- Approved production email templates/copy for invoice available, payment overdue, receipts, and finance export notifications.
- Legacy export files for migration dry run and cutover, including row counts/hashes and source ownership.

## Items that must remain archive-only

- Old credentials, API auth records, provider secrets, Stripe/PayPal tokens, webhook secrets, or any plaintext sensitive provider data.
- Raw unrestricted legacy `EmailLog.Body`, raw errors, and raw recipient lists unless retained in a controlled archive with approved access.
- Unapproved invoice/legal wording, fee text, public/operator content, logos, and team content from `InvoicingOrganisation` or `InvoicingOrganisationTeam`.
- Legacy invoice/payment provider payloads that contain sensitive or card data.
- Old CMS/Umbraco finance-adjacent content unless KBT classifies it as retained business content.
- Any legacy values that imply official production fees, VAT treatment, legal text, or KBT approvals without current signoff.

## Acceptance criteria for implementation

- Current submission/payment/manual MVP behavior remains intact.
- DB-first production-like runtime remains fail-closed for missing finance/provider config and does not use mutable map persistence as canonical.
- `assessment_episodes` remains the operational lifecycle root; `applications` remains applicant package state only.
- Fee schedules and fee lines support effective dates, applicability, area bands, currency, tax snapshots, status/versioning, lower-env placeholder seeds, and production activation only from approved KBT Finance config.
- Invoice headers preserve invoice-time billing, park, organisation, contact, PO/no-PO, currency, subtotal, tax, total, status, due/generated/sent/paid timestamps, and void/cancel/supersede readiness where implemented.
- Invoice numbers are unique within an approved explicit scope, generated idempotently, imported safely, and lower-env placeholder-only until KBT Finance approves production numbering.
- Invoice `due_at` and payment terms are immutable invoice-time snapshots and do not depend permanently on `now + 30 days`.
- Invoice lines preserve description, quantity, unit amount, tax name/rate, tax amount, line total, fee schedule line reference, source metadata, and application area snapshot reference.
- `payment_events` records manual mark-paid, override, overdue block, provider placeholder, and legacy import events append-only without secrets.
- Issued/imported invoices and accepted payment events are immutable; corrections use supersede, void, cancel, or correction-event flows.
- Rounding, currency precision, line subtotal, tax amount, invoice subtotal, and invoice total calculations are deterministic and do not invent production VAT/tax treatment.
- Existing `payment_states` compatibility is preserved or intentionally replaced with an equivalent latest-state projection and contract behavior.
- CSV/manual finance export is supported as the MVP-safe path, with Business Central status/reference/error fields or events ready but no credential dependency.
- Goal 1 provenance links cover legacy `Fee`, `Invoice`, finance-related `ParkAwardApplication`, `InvoicingOrganisation`, `InvoicingOrganisationTeam`, and relevant `EmailLog` records.
- Reconciliation reports cover counts, totals, VAT/tax, currency, country/season grouping, missing targets, duplicates, orphan rows, source-to-target, target-to-source, `ParkAwardApplication.TotalCost` vs `Invoice.TotalCost`, missing billing snapshots, and missing area snapshots.
- Goal 5 `application_area_snapshots` is the only fee-matching area source for invoice generation.
- Later park-area overrides cannot alter historic invoices.
- Applicant/judge/public DTOs expose no migration provenance, raw provider data, Business Central internals, raw Mystery metadata, or unapproved finance/legal text.
- Tests cover the proposed finance, reconciliation, export, redaction, audit, and regression cases.
