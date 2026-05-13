# Goal 5 - High-Risk Model Corrections Plan

PLAN ONLY. Do not implement from this document without a separate implementation task and contract review where public/admin DTOs change.

## Executive recommendation

Implement a small set of already-decided architecture corrections before legacy replacement readiness is claimed:

1. Add explicit episode carryover fields to `assessment_episodes`: `operational_year` and `source_cycle_id`, or a proven equivalent that is queryable without migration sidecar joins.
2. Add assignment-level participant role semantics to judge assignments. Primary/secondary/Mystery must be roles on the episode assignment, not global user roles.
3. Add typed, source-tracked park/application size support in hectares so fee matching and judge-count rules can be reconciled without relying on generic JSON or loose `sizeBand` strings.
4. Add a versioned legacy field mapping manifest for important `Park`, `ParkAwardApplication`, `ParkApplicationNote`, CMS/profile, and archive-only fields.
5. Preserve legacy scoring/form payloads through archive/provenance, then map only approved, configurable modern scoring data into the runtime assessment framework.
6. Classify public/profile/CMS fields deliberately. Do not force all legacy public content into backend domain tables.

These corrections must preserve the current architecture: `assessment_episodes` remains the operational lifecycle root, `applications` remains applicant package/draft/submission state only, and Goal 1 migration links remain provenance only. Domain tables continue to be the runtime source of truth.

## Existing repo evidence

Current backend posture:

- `docs/implementation/system_state.md` says the backend is AWS staging/UAT handoff-ready with external gates, not production launch approval.
- `assessment_episodes` is the operational lifecycle root; `applications` owns applicant package state only.
- Open production inputs remain external: official scoring, applicant bands, fees, VAT/legal wording, provider credentials, Business Central, public map dispatch, and migration dry runs.
- Goal 1 is complete and added sidecar migration provenance and reconciliation tables in `packages/db/migrations/0021_migration_reference_reconciliation.sql`.

Episode/cycle evidence:

- `packages/db/migrations/0003_organisations_parks_locations_cycles_episodes.sql` defines `award_cycles`, `cycle_windows`, and `assessment_episodes`.
- Current `assessment_episodes` columns are: `id`, `park_id`, `award_cycle_id`, `cycle_window_id`, `award_track_code`, `episode_type`, `status`, `mystery_suppressed`, timestamps.
- Current `assessment_episodes` does not have `operational_year` or `source_cycle_id`.
- Current schema lacks `award_category_id`; it uses `award_track_code`. Goal 5 should document Standard-only MVP / `award_track_code` as the current category equivalent and defer full `award_category_id` support unless a separate category implementation task or ADR approves adding it now.
- Current uniqueness is `UNIQUE (park_id, award_cycle_id, episode_type)`.
- `cycle_windows` has `award_cycle_id` and `episode_type`, but the current schema does not enforce that `assessment_episodes.cycle_window_id` belongs to the same `award_cycle_id` with compatible `episode_type`.
- Final architecture decisions state `D-004: assessment_episodes includes operational_year and source_cycle_id`.
- Requirements confirm dual-window carryover: a prior-year Mystery episode and current-year Full Assessment episode can coexist for the same park.

Allocation/judge evidence:

- `packages/db/migrations/0010_allocation_workflow_candidates_coi_release_acceptance.sql` defines `allocations` and `judge_assignments`.
- `judge_assignments` currently has no `role`, `assignment_role`, or participant-role column.
- Current assignment rows store `allocation_id`, `assessment_episode_id`, `assessor_profile_id`, `status`, `contact_reveal_available`, `version`, timestamps.
- Current contact reveal logic in `apps/api/src/postgres-domain-stores/allocation-repository.ts` reveals only for Full Assessment and only when every assignment row is `ACCEPTED`.
- Requirements define Primary Judge and Secondary Judge as allocation concepts; both must accept before Full Assessment contact reveal. Mystery never reveals.
- Legacy `Award` has `PrimaryJudgeID`, `SecondaryJudgeID`, `IsPrimaryJudgeConfirmed`, `IsSecondaryJudgeConfirmed`, and allocation dates.

Park size evidence:

- Legacy `Park.ParkSize` and `ParkAwardApplication.ParkSize` are `decimal(10,2)`.
- Current `parks` and `park_locations` have no typed area/size column.
- Current registration location suggestion contract has only `sizeBand` with `manual_required` or `suggested_from_os_open_greenspace`.
- Current allocation ready read models always return `suggestedJudgeCount: 2` and `judgeCountReasons: ["new_site"]` in the DB-backed path.
- Requirements confirm OS Open Greenspace can suggest park size, applicant confirmation is required, and judge-count defaults include `>25 hectares`.
- Fee schedule values and applicant bands remain KBT/finance inputs and must not be invented.

Application/profile/scoring evidence:

- `application_field_values.field_value` is generic JSON keyed by `section_key` and `field_key`.
- There is no repo-visible versioned legacy field mapping manifest.
- Current scoring tables are configurable lower-env placeholders: `assessment_template_configs`, `assessment_template_criteria`, `judge_assessments`, `assessment_score_entries`, and `assessment_evidence`.
- `assessment_template_criteria.placeholder_only` is enforced true in migrations.
- `decision_results` stores raw internal scoring totals and threshold flags, while applicant result DTOs intentionally hide raw scores.
- Legacy `ParkApplicationNote` includes `DeskAssesment`, `FieldAssesment`, `TotalScore`, `FormsValue`, `FormType`, feedback file, result booleans, and judge confirmation flags.

Public/CMS evidence:

- `park_award_cache` and `public_map_update_events` support derived publication state, not a full public profile/CMS model.
- `docs/source/schema_GreenFlag_Live.md` includes public/profile fields on `Park`, `ParkEvent`, `Facility`, `ParkFacility`, `ResourceLog`, `ResourceDownloadLog`, and `ContactForms`.
- `docs/source/schema_KBT_GFA.md` is primarily Umbraco CMS/Forms infrastructure. Goal 1 cataloged selected Umbraco candidates as `unclassified_pending_review` until KBT confirms business, retained public content, auth/audit/consent, or archive obligations.

## Proposed schema/model corrections

### 1. `assessment_episodes` operational year and source cycle

Plan the future migration as an additive, backfilled correction:

- Add `assessment_episodes.operational_year integer`.
- Add `assessment_episodes.source_cycle_id uuid references award_cycles(id)`.
- Backfill existing rows with `operational_year = award_cycles.cycle_year` and `source_cycle_id = award_cycle_id`.
- Make both columns `NOT NULL` after backfill if all existing rows can be mapped.
- Treat `source_cycle_id` as a reference to modern `award_cycles`, not directly to legacy `CountrySeason`. Legacy `CountrySeason` and source IDs should map through Goal 1 `migration_entity_links`.
- Store `operational_year` rather than deriving it at read time. Carryover reporting can differ from `award_cycles.cycle_year`, and source docs explicitly call it out as a lifecycle-critical field.
- Add composite integrity so `assessment_episodes.cycle_window_id` must belong to the same `award_cycle_id` and compatible `episode_type`. PostgreSQL can support this with a unique constraint on `cycle_windows(id, award_cycle_id, episode_type)` plus a composite FK from `assessment_episodes(cycle_window_id, award_cycle_id, episode_type)`, or equivalent trigger/service validation if migration compatibility blocks a composite FK.
- Keep the existing episode-first ownership. Do not move carryover state to `applications.status`.
- Keep operational-cycle uniqueness anchored on `award_cycle_id`. `source_cycle_id` is provenance/reporting for carryover and must not replace operational-cycle uniqueness unless a specific ADR justifies that change.

Recommended indexes/constraints:

- `idx_assessment_episodes_operational_year` on `(operational_year, episode_type, status)`.
- `idx_assessment_episodes_source_cycle` on `(source_cycle_id, episode_type)`.
- `idx_assessment_episodes_park_operational` on `(park_id, operational_year, episode_type)`.
- Preserve current active uniqueness as `park_id + award_cycle_id + episode_type` for the Standard-only MVP.
- If category support is added later, evolve uniqueness to `park_id + award_cycle_id + award_category_id + episode_type`.
- Do not create uniqueness on `(park_id, source_cycle_id, episode_type)` as the operational guard. `source_cycle_id` can be indexed for reporting/reconciliation, but it is not the lifecycle uniqueness anchor.
- Do not create a uniqueness rule on `(park_id, operational_year)` alone.

Implementation verification before migration:

- Query actual `assessment_episodes` rows and confirm each has a valid `award_cycle_id` and `cycle_window_id`.
- Verify each `cycle_window_id` belongs to the current `award_cycle_id` and the same `episode_type`; report mismatches through Goal 1 reconciliation before enforcing composite validation.
- Verify `source_cycle_id` can reference `award_cycles` for modern runtime rows.
- Verify legacy `CountrySeason` records can map to modern `award_cycles` through `migration_source_records` and `migration_entity_links`.

Required behavior tests:

- A 2025 Mystery episode and 2026 Full Assessment episode can coexist for the same park.
- Both episodes remain rooted in `assessment_episodes`; no application status owns Mystery/carryover lifecycle.
- Queries by `operational_year` return both carryover and current work where expected.
- Applicant Mystery surfaces still show only the safe under-review state.

### 2. Primary/secondary judge role semantics

The current `judge_assignments` table can serve as the assignment participant table, but it needs explicit participant role metadata.

Plan the future migration as a staged safety change:

- Add `judge_assignments.assignment_role text` as nullable first.
- Suggested values: `PRIMARY_JUDGE`, `SECONDARY_JUDGE`, `MYSTERY_JUDGE`, `TRAINING_OBSERVER`.
- Add `judge_assignments.required_for_contact_reveal boolean not null default true`.
- Backfill existing Full Assessment rows deterministically only if ordering and allocation history are sufficient. Otherwise mark backfill rows as `PRIMARY_JUDGE` only where there is exactly one assignment, and require migration review for multi-judge allocations.
- Report ambiguous rows through Goal 1 reconciliation items, including missing legacy primary/secondary source links, conflicting assignment counts, or assignments whose role cannot be inferred safely.
- Enforce `assignment_role NOT NULL` only after deterministic rows are backfilled and ambiguous rows are resolved or explicitly archived/deferred by migration signoff.
- For Mystery episodes, enforce `assignment_role = 'MYSTERY_JUDGE'`.
- For Full Assessment, enforce one primary judge per allocation; allow at most one secondary judge unless KBT approves multi-participant variants.
- Training third-judge support should use `TRAINING_OBSERVER` and should not accidentally block contact reveal unless KBT marks it required.

Recommended constraints/indexes:

- Partial unique index for one active `PRIMARY_JUDGE` per allocation and per episode where applicable.
- Partial unique index for one active `SECONDARY_JUDGE` per allocation and per episode where applicable.
- Partial uniqueness should exclude inactive/terminal rows such as `DECLINED` and `WITHDRAWN` so replacement history is preserved.
- Check constraint aligning `assignment_role` with episode type may require trigger/service validation because `episode_type` lives on `assessment_episodes`.
- Index `(assessment_episode_id, assignment_role, status)`.
- Index `(allocation_id, assignment_role, status)`.

Service/repository behavior:

- Allocation hold must assign participant roles explicitly instead of relying on input order.
- Reassign must preserve the replaced assignment role unless an admin explicitly changes the role with audit.
- Contact reveal must use all assignments where `required_for_contact_reveal = true` and `status = ACCEPTED`; Mystery remains hard false regardless of acceptance.
- Assessor-facing DTOs may expose role only where contract review approves it. Applicant/org surfaces must not infer or reveal Mystery role details.

Legacy mapping:

- Legacy `Award.PrimaryJudgeID` maps to the `judge_assignment` with `assignment_role = PRIMARY_JUDGE`.
- Legacy `Award.SecondaryJudgeID` maps to `assignment_role = SECONDARY_JUDGE`.
- Legacy `IsPrimaryJudgeConfirmed` and `IsSecondaryJudgeConfirmed` map to `judge_assignments.status` only through migration rules and reconciliation, not by recreating legacy booleans.
- Use Goal 1 link roles such as `primary_assignment_source`, `secondary_assignment_source`, `primary_confirmation_source`, and `secondary_confirmation_source`.

### 3. Typed park size / area data

Add typed size support without hardcoding fees or applicant bands.

Recommended model:

- Add `park_area_measurements` for source-tracked park area history and current area.
- Add `application_area_snapshots` for immutable application-time area used by fee matching and historical reconciliation.
- `park_area_measurements` columns should include `id`, `park_id`, `area_hectares numeric(10,2)`, `source_kind`, `source_label`, `confirmed_by_actor_id`, `confirmed_at_utc`, `is_current`, `audit_event_id`, timestamps.
- `application_area_snapshots` columns should include `id`, `application_id`, `assessment_episode_id`, `park_id`, `park_area_measurement_id`, `area_hectares numeric(10,2)`, `source_kind`, `snapshot_reason`, `captured_at_utc`, timestamps.
- Suggested `source_kind` values: `os_open_greenspace_suggestion`, `applicant_confirmed`, `manual_entry`, `legacy_import`, `admin_override`.
- Enforce positive values and one current measurement per park.
- For annual fee matching, always use `application_area_snapshots`. Do not recalculate historic fees from a later current-area override.
- Admin overrides require a reason and audit event.
- Domain tables should normally not FK directly to Goal 1 `migration_source_records`. Prefer linking provenance through Goal 1 `migration_entity_links` from source records to `park_area_measurements` and `application_area_snapshots`. A direct nullable `source_record_id` should be added only with a deliberate implementation note explaining why query locality or audit requirements justify coupling a runtime table to the migration sidecar.

Service/repository behavior:

- Registration location lookup should return a typed area candidate in hectares where available, not only a string `sizeBand`.
- Applicant confirmation should create an applicant-confirmed measurement. OS suggestions are suggestions until confirmed.
- Manual entry should be available for non-GB, Northern Ireland, and OS no-match cases.
- Allocation judge-count suggestion should read typed hectares and policy config, then produce `over_25_hectares` when applicable.
- Goal 2 fee matching should consume typed area and a configurable fee schedule/band config. It must not hardcode production fee values.

Legacy mapping:

- `Park.ParkSize` maps to a `legacy_import` park area measurement.
- `ParkAwardApplication.ParkSize` maps to an immutable `application_area_snapshots` row.
- If both exist and disagree, keep both with source provenance and create a Goal 1 reconciliation item for review.

### 4. Scoring/form import and archive model

Do not copy legacy scoring schema as runtime architecture. Use the modern configurable scoring framework, with raw legacy preservation through archive/provenance.

Plan:

- Register each `ParkApplicationNote` row in Goal 1 `migration_source_records`.
- Link to modern `assessment_episode` and `application` where available.
- If a modern judge/assignment exists, link to `judge_assignment` and optionally a `judge_assessment`.
- Preserve raw `FormsValue`, legacy feedback files, and unparsed score payloads as archive records or external archive manifests with checksums. Do not store unrestricted raw payloads in ordinary runtime DTOs.
- Import structured `assessment_score_entries` only when a KBT-approved template mapping exists for the legacy `FormType` and `FormsValue`.
- Preserve legacy `DeskAssesment`, `FieldAssesment`, `TotalScore`, `IsPassed`, `IsResultsAnnounced`, `IsResultsLive`, `ScoreSheetSubmitted`, and `FeedbackSubmitted` as import metadata/archive evidence until approved mapping rules define runtime impact.
- Threshold flags can be preserved as legacy flags in archive/reconciliation and, where safe, as `decision_results.threshold_met`/`threshold_acknowledged` summaries. Do not invent official criteria, bands, or applicant-facing score labels.

Potential schema addition:

- Prefer external archive plus Goal 1 `migration_archive_records`.
- If operational admin review requires in-app visibility of imported historical score payloads, add a narrow `legacy_assessment_import_summaries` table with sanitized summary fields, not raw `FormsValue` as a public/admin DTO by default.

## Proposed mapping manifests/config

Create a versioned mapping manifest, for example `packages/db/seeds/legacy-field-mapping.v1.json` or `packages/migration-config/legacy-field-mapping.v1.yaml`, plus validation tests. The exact path is an implementation choice, but it must be versioned, reviewed, and referenced by Goal 1 `migration_mapping_rules.mapping_version`.

Suggested manifest fields:

- `sourceSystem`, `sourceTable`, `sourceColumn`
- `mappingVersion`
- `classification`
- `targetEntityTypes`
- `targetSectionKey` / `targetFieldKey` where applicable
- `archiveRequired`
- `requiresKbtInput`
- `notes`
- `sensitivity`

Required classifications:

- `canonical_park_field`
- `park_location_field`
- `park_profile_public_content`
- `application_field_value`
- `document_asset`
- `invoice_billing_field`
- `assessment_scoring_result_field`
- `migration_archive_only`
- `intentionally_not_needed`

Minimum field coverage:

| Legacy field/group | Planned classification | Planned destination |
| --- | --- | --- |
| `Park.Title`, `ParkAwardApplication.ParkTitle` | canonical park field plus application snapshot | `parks.name`; annual application field only where snapshot differs |
| `Park.AlternateTitle`, `ParkAwardApplication.ParkAlternateTitle` | park profile/public content | profile/CMS adapter or archive if no public profile scope |
| Park description | park profile/public content | backend profile if public replacement needs it; otherwise CMS/content adapter or archive |
| Address/town/postcode | park location field plus application snapshot | `park_locations` plus application field values for submitted snapshot |
| Country/Region/County/Authority | park location/reference mapping | `park_locations.country/region/local_authority`, reference archive for legacy IDs |
| ContactName/TelNo/Email | application field value/contact snapshot | `contact_details` fields or future contact model from Goal 4 |
| Primary and secondary contacts | application field value/contact snapshot | `contact_details.primary_*`, `contact_details.secondary_*`; archive extra legacy-only attributes |
| ParkType/ParkFacilities | application/profile fields | reference mapping or profile/public filters if approved; otherwise application JSON plus archive |
| ParkSize | typed area data | `park_area_measurements` and `application_area_snapshots` |
| ParkWalkTime | application/profile/archive | `site_information.park_walk_time` or profile if approved; archive otherwise |
| ParkContractor | application/profile/archive | `site_information.park_contractor`; likely archive/profile unless reporting need confirmed |
| BecomeAFriend | public/community/archive | CMS/content adapter or archive; not core lifecycle |
| IsTrustProtected | public/profile/archive | profile flag only if public/backend ownership approved; otherwise archive |
| AverageYearlyVisitors | application/reporting field | `optional_information.average_yearly_visitors` |
| TrainingBudgetPerStaffMember | application/reporting field | `optional_information.training_budget_per_staff_member` |
| RevenueSpentLastYear | application/reporting/finance-adjacent field | `optional_information.revenue_spent_last_year`; not invoice authority |
| CapitalSpentLastYear | application/reporting/finance-adjacent field | `optional_information.capital_spent_last_year`; not invoice authority |
| AwardYearFirstApplied | application/profile/history field | profile/history or application field; reconcile against episodes |
| SpecialAwardYearFirstApplied | application/profile/history field | archive or profile/history if special awards retained |
| WonGreenPennantAward | derived result/archive | derive from historical decisions/cache only if mapped; otherwise archive |
| WonGreenHeritageAward | derived result/archive | derive from historical decisions/cache only if mapped; Heritage remains blocked pending criteria |
| WonSpecialInnovationAward | derived result/archive | archive or result history only if approved |
| Votes / ParksVote | public analytics/archive | archive unless reporting/product confirms analytics continuity |
| Opening times | park profile/public content | backend profile/CMS adapter if public/assessor use confirmed; else archive |
| Unavailable judging dates | application field value | `site_information.unavailable_judging_dates`; may also feed assessor prep read model |
| Qualification/Publicity statements | application field value/profile candidate | `publicity` fields; profile only if approved for publication |
| Visitor/staff/volunteer statistics | application field value | `optional_information` or track-specific sections; reportable mapping versioned |
| Land owner fields | application field value | `site_information.land_owner_*`; likely personal-data sensitivity |
| ParkMP/ParkConstituency | park location/profile/reporting | `park_locations.constituency` for constituency; MP name as application/reporting field or archive |
| Community group fields | application field value/archive | track-specific field keys; Community track remains blocked pending criteria |
| Heritage/innovation fields | application field value/document asset/archive | track-specific fields and supporting docs; do not activate track without KBT criteria |
| IsMysteryShop | episode lifecycle field | `assessment_episodes.episode_type = MYSTERY_SHOP`, `mystery_suppressed = true` |
| IsPilot | migration archive only unless KBT defines active meaning | archive/reconciliation flag |
| IsManagementPlanRequired | application/document requirement marker | document requirement config or application snapshot; do not override Mystery rule |
| SeasonYear | episode/cycle mapping | `award_cycles`, `source_cycle_id`, `operational_year` |
| Public display/profile flags | public/profile/cache decision | profile/CMS/public map config or archive; not lifecycle authority |
| AgreeShareManagementPlan | consent/profile/archive | consent/audit archive; only expose if approved use exists |
| AdditionalField/AdditionalFieldData/ContactTypeAdditionalField | mapping manifest required | classify each configured field after source export inventory; unknowns block passed reconciliation |
| ResetLog | admin/system archive | archive/reconciliation only unless KBT identifies active operational value |
| Settings active keys | typed config/archive | map only active business settings into typed config; archive obsolete/generic keys |
| InvoicingOrganisation / InvoicingOrganisationTeam | Goal 2 finance/content input | classify as finance billing/content inputs for Goal 2; archive public/operator content unless ownership approved |

Scoring/form manifest coverage:

- `ParkApplicationNote.DeskAssesment`: scoring/result archive summary; structured mapping only with approved template.
- `ParkApplicationNote.FieldAssesment`: scoring/result archive summary; structured mapping only with approved template.
- `ParkApplicationNote.TotalScore`: scoring/result archive summary; do not expose to applicants.
- `ParkApplicationNote.FormsValue`: archive raw payload, checksum, optional parser per approved `FormType`.
- `ParkApplicationNote.FormType`: mapping discriminator.
- `FeedbackFile`: document/result artifact/archive mapping.
- `IsPassed`, `IsResultsAnnounced`, `IsResultsLive`: decision/publication archive summary and possible `decision_results` mapping after rules are approved.
- Judge confirmation flags: assignment status import evidence, not global user role.

## Proposed service/repository changes

Future implementation should update DB-first services only. Keep map stores non-canonical for production-like runtime.

Episode/cycle services:

- Update creation/import paths to populate `operational_year` and `source_cycle_id`.
- Update read models that currently join `award_cycles.cycle_year` where carryover reporting requires `operational_year`.
- Add reconciliation utilities to detect `cycle_window_id`/`award_cycle_id` mismatches before enforcing constraints.

Allocation services:

- Update hold/reassign/import paths to set `assignment_role`.
- Update contact reveal logic to require all `required_for_contact_reveal` assignments accepted for Full Assessment and never reveal for Mystery.
- Update ready episode judge-count logic to read typed park/application area and history rather than returning hardcoded `new_site`.
- Preserve override audit for final judge count.

Park/application size services:

- Add repository methods for OS suggestion, applicant confirmation, manual entry, legacy import, and admin override.
- Emit audit/admin override events for manual admin changes.
- Expose typed area only through approved admin/applicant/internal DTOs. Migration provenance remains internal.

Migration services:

- Add mapping manifest validation to Goal 1 mapping-rule registration.
- Generate reconciliation items for unmapped required legacy fields, Park/ParkAwardApplication size conflicts, missing source cycle links, missing primary/secondary assignments, and unsupported raw scoring payloads.

Assessment/results services:

- Add import-only mapping utilities that link legacy score notes to modern episodes/assessments/archive.
- Keep applicant result payloads safe. Applicant result DTO must continue to hide raw scores, FormsValue, threshold internals, judge identity, and Mystery metadata.

DTO/contract impact:

- Any DTO/OpenAPI changes must be deliberate and contract-reviewed.
- Applicant, judge, and public surfaces must not expose migration provenance, raw scoring/form payloads, source-cycle internals that reveal Mystery, or assignment-role metadata that leaks Mystery.
- Assessor/admin exposure of assignment roles, area snapshots, or imported historical summaries should be explicit in contracts and scoped by RBAC/redaction.

Public/profile services:

- Goal 5 should classify public/profile/CMS fields, but must not implement a new CMS or public profile model unless there is an approved product/backend ownership decision.
- Add a backend park profile only for fields the operational backend must own.
- Use a CMS/content adapter or archive manifest for public content/resource records that do not belong in operational backend tables.

## Proposed tests

Episode/carryover:

- Dual-window carryover: one park can have a prior-source-cycle Mystery episode and current-source-cycle Full Assessment episode visible in the same operational year/work queue where required.
- `source_cycle_id` references `award_cycles`; legacy `CountrySeason` maps through Goal 1 links.
- Composite cycle/window integrity rejects an episode whose `cycle_window_id` belongs to a different `award_cycle_id`.
- Episode-first regression: application state does not own allocation, decision, payment, publication, or Mystery lifecycle.

Assignment roles/contact reveal:

- `judge_assignments` requires assignment-level role values.
- One primary judge per active Full Assessment allocation.
- Secondary role is per allocation, not a global user role.
- Legacy primary/secondary import creates correct Goal 1 links.
- Full Assessment contact reveal remains false after only one required participant accepts.
- Full Assessment contact reveal becomes true only after all required participants accept.
- Mystery never reveals judge, visit, allocation, contact, judge count, or assignment role details.

Park size:

- OS Open Greenspace suggestion is stored as suggestion/provenance only until applicant confirmation.
- Applicant-confirmed size creates a typed current measurement.
- Manual entry works when OS is unavailable.
- Legacy `Park.ParkSize` and `ParkAwardApplication.ParkSize` can coexist with source tracking.
- Admin override requires audit and does not erase previous measurement provenance.
- `>25 hectares` judge-count reason is calculated from typed data and configurable policy; fee values are not hardcoded.
- Goal 2 fee matching can consume typed area/size band keys without production fee values.

Mapping manifest:

- Manifest includes every required field listed in this plan.
- Unknown `AdditionalField` definitions cannot pass reconciliation until classified.
- Every manifest entry has classification, target/archive decision, sensitivity, and mapping version.
- Manifest version is referenced by Goal 1 `migration_mapping_rules`.

Scoring/form import:

- `ParkApplicationNote.FormsValue` is archived or externally manifest-linked with checksum.
- Structured score-entry import is rejected unless a mapping to approved template criteria exists.
- Legacy threshold/result booleans are preserved as import/archive evidence without inventing criteria or applicant bands.
- Feedback file maps to document/result artifact/archive according to manifest.
- Applicant result payload still hides raw scores and legacy FormsValue.

Public/profile/archive:

- Public display/homepage flags are not copied into lifecycle state.
- Profile fields classified as backend profile, public map/cache, CMS adapter, archive only, or intentionally not needed.
- Goal 5 classification does not authorize a new CMS/public profile model. Implementation requires an approved product/backend ownership decision.
- Umbraco Forms/content records are only migrated if they represent business submissions, retained public content, auth/audit/consent obligations, or archive candidates.

Goal 1 provenance:

- Migration links remain provenance only and never drive runtime decisions when domain rows disagree.
- Reconciliation failures can propose additional mappings/profile/archive decisions, but already-decided architecture corrections are implemented first.
- Applicant/judge/public DTOs do not expose migration metadata, raw scoring/form payloads, source-cycle internals that reveal Mystery, or assignment-role metadata that leaks Mystery.

## Goal 1 migration-layer usage

For every correction:

- Use `migration_source_table_catalog` to classify source tables and confirm whether rows are migrate/link/archive/excluded.
- Use `migration_import_batches` and `migration_import_batch_source_tables` to record export manifests, expected counts, hashes, and batch context.
- Use `migration_source_records` for each source row or field-group row, with sanitized fingerprints only.
- Use `migration_entity_links` to link source records to modern domain rows. Links are provenance only.
- Use `migration_archive_records` for raw legacy payloads, CMS resources, unsupported scoring payloads, and archive-only public/content records.
- Use `migration_mapping_rules` to bind the Goal 5 mapping manifest version to deterministic missing-target checks.
- Use `migration_reconciliation_reports` and items for coverage failures, source/target mismatches, size conflicts, missing primary/secondary roles, unmapped fields, and unsupported FormsValue payloads.
- Domain tables should remain runtime source of truth and should not normally contain direct FKs to `migration_source_records`. Use `migration_entity_links` for provenance unless a future implementation deliberately documents why a nullable direct source reference is required.

Correction-specific usage:

- Episode source cycle: link legacy `CountrySeason` to `award_cycle`; link `ParkAwardApplication` and `Award` to `assessment_episode`; use report items for missing or ambiguous source cycles.
- Assignment roles: link `Award.PrimaryJudgeID` and `Award.SecondaryJudgeID` to specific `judge_assignment` rows with role-specific `link_role`.
- Park size: link `Park.ParkSize` and `ParkAwardApplication.ParkSize` to typed measurement/snapshot rows; reconcile disagreements.
- Mapping manifest: each manifest target becomes an active mapping rule or archive rule.
- Scoring/form: link `ParkApplicationNote` to episode/application/assessment/archive; use archive records for raw FormsValue and feedback files.
- Public/profile/CMS: catalog Umbraco and public content tables only when they meet business/retention tests; otherwise archive or exclude with KBT signoff.

## Risks / open decisions

- Backfilling `operational_year` incorrectly could make carryover reports misleading. Mitigation: require reconciliation against `CountrySeason`, `SeasonYear`, and current cycle/window data.
- Adding assignment roles could conflict with existing historical assignment rows if input order was used as an implicit role. Mitigation: require migration review for ambiguous multi-judge assignments.
- A current park area override could accidentally change historic fee matching. Mitigation: keep application-time size snapshots.
- Generic JSON field values may already contain valuable application data but without stable field names. Mitigation: manifest validation must fail closed for required fields.
- Raw legacy `FormsValue` may contain personal data or unsupported formats. Mitigation: archive externally with checksums and sensitivity classification; do not expose through ordinary DTOs.
- Public profile fields can expand backend scope into CMS replacement. Mitigation: classify backend-owned vs CMS adapter vs archive-only before schema work, and do not implement a CMS/public profile model without approved product/backend ownership.
- Goal 1 links may be misused as runtime source of truth. Mitigation: tests and service rules must read domain tables, not migration links, for ordinary behavior.

## Items blocked by KBT input

- Official scoring criteria, subcriteria, guidance, thresholds, recommendation rules, and applicant band ranges/labels.
- Full production fee schedule, size-band matrix, VAT/currency/legal invoice wording, and Business Central mapping.
- Final allocation variants beyond confirmed defaults, including country/operator/site-complexity variants and third-judge policy.
- Whether pilot flags have any active operational meaning.
- Which public/CMS fields must be retained in the new public site versus archived.
- Which Umbraco Forms represent business submissions or legal/audit/consent obligations.
- Retention policy for legacy contact forms, resource logs/downloads, public events, votes, and CMS audit records.
- How to interpret ambiguous legacy `FormsValue` payloads and unsupported form types.
- Whether current public homepage/display flags should be honored in a future CMS/public map product.
- Which active `Settings` keys remain authoritative and which are obsolete.
- Whether `InvoicingOrganisation` and `InvoicingOrganisationTeam` fields are finance configuration, operator public content, notification content, or archive-only.

## Items that must remain archive-only

Unless KBT provides a concrete operational requirement, keep these out of runtime domain tables:

- Legacy passwords, API credentials, refresh tokens, 2FA secrets, and old auth internals.
- Umbraco CMS infrastructure tables: content type definitions, templates, macros, caches, server nodes, redirects, relation internals, webhooks, and most node/version internals.
- Raw `ParkApplicationNote.FormsValue` where no approved template mapping exists.
- Legacy EmailLog raw bodies/errors except where retained in a controlled archive.
- Public votes and resource analytics if reporting continuity is not required.
- Research Centre `RC_*` tables unless confirmed in Green Flag Award replacement scope.
- `IsPilot` until KBT defines active behavior.
- Homepage/marketing placement flags unless a CMS/public content owner confirms they must be migrated.
- Obsolete generic settings after active values are mapped into typed config.
- `ResetLog` unless KBT identifies a live operational or audit requirement.

## Acceptance criteria for implementation

The future implementation agent is done only when:

- `assessment_episodes` has explicit `operational_year` and `source_cycle_id`, or an approved equivalent with tests and docs proving carryover behavior.
- `source_cycle_id` references modern `award_cycles`; legacy source cycles map through Goal 1 links.
- Active episode uniqueness remains anchored on the operational cycle: `park_id + award_cycle_id + episode_type` for Standard-only MVP, or `park_id + award_cycle_id + award_category_id + episode_type` if category support is explicitly added.
- Goal 5 documents `award_track_code` as the current Standard-only MVP equivalent or implements category support only if separately approved.
- Cycle/window integrity is enforced or fully reconciled before enforcement.
- Cycle-window integrity validates `cycle_window_id`, `award_cycle_id`, and `episode_type` together.
- Dual-window tests prove prior-year Mystery and current-year Full Assessment coexist for the same park.
- `judge_assignments` or an equivalent assignment participant table stores primary/secondary/Mystery role per assignment.
- Assignment-role migration is staged: nullable add, deterministic backfill, Goal 1 reconciliation for ambiguous rows, then NOT NULL after resolution.
- Role constraints prevent duplicate primary/secondary active assignments where not allowed.
- Full Assessment contact reveal depends on all required participants accepting.
- Mystery reveal remains hard false across applicant, notification, message, visit, allocation, export, and result surfaces.
- Typed park/application size in hectares exists through `park_area_measurements` for current/history and `application_area_snapshots` for immutable fee/historical snapshots, with source tracking for OS suggestion, applicant confirmation, manual entry, legacy import, and admin override.
- Admin size overrides are audited and do not erase provenance.
- Later current-area overrides do not recalculate historic fees or historical application reconciliation.
- Allocation judge-count logic can use typed `>25 hectares` evidence without hardcoded production fees.
- Goal 2 fee matching can consume typed area/size-band keys without inventing fee values.
- A versioned legacy field mapping manifest covers all required fields listed in this plan and is validated by tests.
- `AdditionalField`, `AdditionalFieldData`, and `ContactTypeAdditionalField` are explicitly classified after source inventory or block reconciliation.
- Legacy scoring/form payloads are preserved through archive/provenance, and structured score entries are imported only with approved template mappings.
- Applicant result payloads continue to hide raw scores, FormsValue, threshold internals, and internal notes.
- Public/profile/CMS field decisions are explicit: backend profile, public map/cache, CMS/content adapter, archive only, or intentionally not needed.
- Goal 5 does not implement a new CMS/public profile model without approved product/backend ownership.
- Goal 1 migration-layer usage is implemented for source catalog, mapping rules, source records, entity links, archive records, reconciliation reports, and report items.
- Migration links remain provenance only. Runtime services use domain tables as source of truth.
- DTO/OpenAPI changes are contract-reviewed; applicant/judge/public surfaces do not expose migration provenance, raw legacy score/form payloads, Mystery-revealing source-cycle internals, or assignment-role metadata that leaks Mystery.
- Existing DB migration checks, DB integration tests, contract/OpenAPI checks, Mystery redaction tests, and runtime safety checks remain green.
- No frontend/UI files are touched for this backend model correction goal unless a later explicit frontend task authorizes it.
