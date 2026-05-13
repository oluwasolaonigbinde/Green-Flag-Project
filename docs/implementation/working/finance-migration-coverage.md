# Finance Migration Coverage Implementation

Goal 2 adds migration-safe finance coverage for legacy replacement readiness. It keeps the existing manual/offline MVP payment posture, preserves current `amount_marker` DTO compatibility, and adds modern finance facts without copying legacy `Fee` or `Invoice` table shapes.

## Implemented Scope

- Added configurable `fee_schedules` and `fee_schedule_lines` with version/effective dates, explicit country/pricing scope fields, track/category-compatible fields, area band matching, currency precision, tax snapshot fields, and lower-env placeholder configuration.
- Expanded `invoices` additively with invoice number scope/policy snapshot, billing/park/organisation snapshots, PO/no-PO snapshot, currency/subtotal/tax/total fields, payment-terms snapshot, immutable `due_at` source metadata, generated/sent/paid/correction readiness fields, and source metadata.
- Added frozen `invoice_lines` with fee schedule line reference, deterministic money fields, application area snapshot reference, and sanitized source metadata.
- Added append-only `payment_events` for manual mark-paid, override, deadline block, export, import/provider placeholders, refunds, reconciliation, void/correction paths.
- Added `finance_export_runs` as the CSV/manual export and Business Central boundary, with reference/status/error placeholders and reconciliation summaries.
- Registered Goal 2 finance target entity types and mapping rules in the Goal 1 migration reference layer.

## Runtime Behavior

Application submission now creates or reuses an `application_area_snapshot`, selects an active fee schedule line, freezes invoice facts/line totals, and keeps the existing applicant invoice read model unchanged. Current public/admin DTOs still expose `amount_marker` rather than new internal finance fields.

Manual mark-paid, Super Admin payment override, and deadline block behavior continue to update `payment_states` as the latest-state projection and now also emit `payment_events` linked to audit/admin override evidence.

Payment CSV export remains the MVP-safe path. The existing export job is preserved, with a linked finance export run and exported payment events where invoices are included. No Business Central API automation or provider credential handling was added.

## Safety Rules

- Invoice numbers use synthetic lower-env placeholders only. Production numbering policy and format remain blocked on KBT Finance approval.
- `due_at` and payment terms are immutable invoice-time snapshots. The current lower-env 30-day placeholder is labelled as such and must not be treated as production logic.
- Issued/imported invoice facts and invoice lines are frozen by database triggers. Corrections must use status/correction metadata, supersede/void/cancel flows, or event records rather than silent mutation.
- `payment_events` is append-only through database trigger protection.
- Money arithmetic uses deterministic two-decimal lower-env currency precision and stores line subtotal, tax amount, invoice subtotal, and invoice total at generation time.
- Fee lookup uses country/track/explicit finance scope fields first. Organisation-specific pricing is modelled but cannot be used without product/KBT Finance approval.
- Invoice artifact/PDF rendering remains outside Goal 2 unless coordinated with Goal 3.

## External Dependencies

- KBT Finance approved production fee schedules, invoice numbering policy, tax treatment, payment terms, invoice/legal wording, and production activation rules.
- Business Central payload/data contract, credentials, status lifecycle, error semantics, and reconciliation ownership.
- Payment provider/Stripe automation, webhook signatures, replay rules, refunds, and card-flow signoff.
- Legacy finance export shape for migration rehearsals and archive-only decisions for legacy invoice/legal/operator content.

## Goal 3 / Goal 4 Follow-Ups

- Goal 3 should own rendered invoice artifacts/PDF storage, retention, download, archive provenance, and any document integration.
- Goal 4 should own contact/person migration decisions needed to populate richer billing contacts, invoice recipients, and operator/team content safely.
