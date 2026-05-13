# Goal 4 Contact, Judge, and COI Migration Coverage Plan

Status: PLAN ONLY for Backend Track A Goal 4.

This plan covers contact, user/admin identity, judge profile, judge application/onboarding, conflict-of-interest, historical note, and finance contact coordination needed for legacy replacement readiness. It does not implement code, edit migrations, edit contracts, edit services, edit tests, or touch frontend files.

Future implementation should reserve:

`packages/db/migrations/0025_contact_judge_coi_migration_coverage.sql`

unless migration numbering has changed by implementation time.

## Executive Recommendation

Implement Goal 4 as a migration-safe modern person/contact and judge-COI coverage layer, not as a recreation of legacy auth or contact tables.

Recommended implementation shape:

- Add modern contact records independent of login users, plus park/organisation/application/billing contact relationships and immutable application-time contact snapshots.
- Keep Cognito as identity provider. Link PostgreSQL `internal_users`, `cognito_identity_links`, and scoped `role_assignments` to approved Cognito provisioning/import output. Never migrate old passwords, API credentials, refresh tokens, 2FA secrets, or session tokens.
- Expand assessor/judge profile coverage through internal profile/detail/preference/capacity/onboarding models while keeping LANTRA/accreditation provider sync as an external/future adapter.
- Add canonical persistent `conflict_of_interest_records` because current `allocation_coi_flags` is useful for candidate filtering but insufficient for text-only legacy COI, manual review, target resolution, active/deleted history, and source ownership.
- Preserve imported historical notes as imported history/archive/admin notes with provenance. Do not rewrite them into new `audit_events`.
- Coordinate finance contact and operator/team content with Goal 2. Billing snapshots can populate invoice/contact facts; public/operator content remains archive-first until ownership is approved.
- Coordinate judge documents with Goal 3. Goal 4 owns person/judge/onboarding relationship rules; Goal 3 owns document asset subtype/storage/archive implementation.

## Existing Repo Evidence

Current backend posture:

- `docs/implementation/system_state.md` says backend is AWS staging/UAT handoff-ready, DB-first, episode-first, and not production launch approved.
- `docs/implementation/agent-operating-model.md` preserves the do-not-regress rules: `assessment_episodes` owns operational lifecycle, `applications` owns applicant package state only, DB-first runtime must stay fail-closed, and Mystery/RBAC/redaction rules must not be weakened.
- `docs/implementation/source-reconciliation.md` confirms allocation requirements: hard COI candidates are excluded before display, soft COI candidates require acknowledgement, Full Assessment contact reveal happens only after all required judges accept, and Mystery never reveals contact details.
- `docs/implementation/gap-register.md` keeps live migration/import, live COI source/import, production provider configuration, KBT inputs, and legal/governance decisions as external gates.

Goal 1 evidence:

- `packages/db/migrations/0021_migration_reference_reconciliation.sql` adds the sidecar migration reference layer:
  - `migration_source_table_catalog`
  - `migration_import_batches`
  - `migration_import_batch_source_tables`
  - `migration_target_entity_types`
  - `migration_mapping_rules`
  - `migration_source_records`
  - `migration_entity_links`
  - `migration_archive_records`
  - `migration_reconciliation_reports`
  - `migration_reconciliation_report_items`
- Goal 1 catalogs core source tables including `Contact`, `ParksContact`, `Judge`, `JudgeApplication`, `JudgeConflictOfInterest`, `Invoice`, and `EmailLog`.
- Goal 1 already enforces sanitized fingerprints, sensitivity classification, missing target reporting, unclassified source blocking, confirmed-link validation, archive records, and audit around migration actions.
- `apps/api/src/migration-reference.test.ts` verifies unsafe metadata rejection, unclassified source blocking, archive-only EmailLog handling, confirmed-link target validation, audit events, and keeping migration metadata out of applicant/judge fixtures.

Goal 5 evidence:

- `packages/db/migrations/0022_high_risk_model_corrections.sql` adds:
  - `assessment_episodes.operational_year`
  - `assessment_episodes.source_cycle_id`
  - `judge_assignments.assignment_role`
  - `judge_assignments.required_for_contact_reveal`
  - `park_area_measurements`
  - `application_area_snapshots`
- Assignment roles are assignment-level metadata: `PRIMARY_JUDGE`, `SECONDARY_JUDGE`, `MYSTERY_JUDGE`, `TRAINING_OBSERVER`.
- Full Assessment reveal now depends on required assignments only; training observers do not block reveal. Mystery reveal remains hard false in repository logic.
- `docs/implementation/working/high-risk-model-corrections.md` says Goal 4 should consume assignment-role provenance for contact/judge/COI migration without copying old schema roles.

Goal 2 finance evidence:

- `packages/db/migrations/0023_finance_migration_coverage.sql` expands `invoices` with billing/park/organisation snapshots, invoice number policy snapshots, currency/tax/total facts, and immutable issued/imported finance fact protections.
- Goal 2 adds `fee_schedules`, `fee_schedule_lines`, `invoice_lines`, `payment_events`, and `finance_export_runs`.
- Goal 2 catalogs `InvoicingOrganisation` and `InvoicingOrganisationTeam` as archive-first finance/operator content. Mapping rules allow optional `organisation` or `archive_record` links, with archive required and runtime use blocked pending finance/product ownership approval.
- `docs/implementation/working/finance-migration-coverage.md` explicitly leaves richer billing contact/person migration and operator/team content decisions to Goal 4.

Current identity model:

- `packages/db/migrations/0002_identity_rbac_audit_foundation.sql` defines:
  - `internal_users(id, email, display_name, status, redaction_profile)`
  - `cognito_identity_links(internal_user_id, cognito_subject, issuer, email, email_verified, mfa_satisfied)`
  - `role_assignments(internal_user_id, role_type, scope_type, scope_id, status, redaction_profile)`
  - append-only `audit_events`
  - append-only `admin_override_events`
- `packages/contracts/src/enums.ts` supports roles `PARK_MANAGER`, `ORG_ADMIN`, `JUDGE`, `KBT_ADMIN`, `SUPER_ADMIN`, `READ_ONLY_VIEWER`, `FINANCE_ADMIN`, and `SYSTEM`.
- `packages/contracts/src/enums.ts` supports scopes `GLOBAL`, `COUNTRY`, `ORGANISATION`, `PARK`, `AWARD_CYCLE`, `AWARD_CATEGORY`, and `ASSIGNMENT`.
- `apps/api/src/auth.ts` resolves sessions from Cognito JWT claims to internal users and active role assignments. Admin roles require MFA.
- `apps/api/src/postgres-runtime.ts` wires `PostgresIdentityRepository` to `internal_users`, `cognito_identity_links`, and `role_assignments`.

Current organisation/park ownership model:

- `packages/db/migrations/0003_organisations_parks_locations_cycles_episodes.sql` defines `organisations`, `parks`, `park_locations`, `award_cycles`, `cycle_windows`, and `assessment_episodes`.
- `apps/api/src/authorization.ts` authorizes resources by `parkId`, `organisationId`, and `countryCode` against role assignment scopes.
- `apps/api/src/postgres-domain-stores/applicant-repository.ts` derives ownership from `parks`, `assessment_episodes`, and `award_cycles`.

Current registration and applicant contact fields:

- `registration_submissions` stores `contact_name`, `contact_email`, `address_line_1`, `town`, `postcode`, `country`, and submitted payloads.
- Application data is section/field JSON through `application_sections` and `application_field_values`; `contact_details` is a section key.
- `packages/db/config/legacy-field-mapping.v1.json` maps `Park.ContactName`, `Park.TelNo`, `Park.Email`, and `ParkAwardApplication` primary/secondary contact fields to application contact payloads/sections.
- There is no reusable canonical `contacts`, `park_contacts`, `organisation_contacts`, or typed `application_contact_snapshots` table today.

Current assessor/judge profile model:

- `packages/db/migrations/0008_judge_profiles_assessor_management_capacity.sql` defines:
  - `assessor_profiles`
  - `assessor_preferences`
  - `assessor_availability_windows`
  - `assessor_capacity_declarations`
- Current profile fields include `display_name`, `email`, `profile_status`, `accreditation_status`, `accreditation_provider`, `primary_region`, preferences, availability, and cycle capacity.
- `apps/api/src/assessor.ts` and `apps/api/src/postgres-domain-stores/assessor-repository.ts` support self-profile updates, admin profile list/detail/create/update/disable, preferences, availability, capacity, and audit.
- Current profile does not cover legacy first/surname separately, alternate email, phones, full address, allocation postcode, latitude/longitude, nearest town, travel radius/restrictions, country availability, detailed training/induction/status fields, specialisms, ID card, emergency contact, or judge application evidence.

Current judge allocation role and COI model:

- `packages/db/migrations/0010_allocation_workflow_candidates_coi_release_acceptance.sql` defines `allocations`, `judge_assignments`, and `allocation_coi_flags`.
- `allocation_coi_flags` supports `flag_type`, `severity`, `reason`, `requires_acknowledgement`, and `source`.
- `apps/api/src/postgres-domain-stores/allocation-repository.ts` filters hard excludes out of candidates and requires acknowledgement for non-hard flags when holding or reassigning allocations.
- Current `allocation_coi_flags` is not enough for persistent COI migration because it lacks source row provenance, raw legacy text/archive linkage, park/org target resolution status, active/deleted dates, source owner/format, manual review lifecycle, and multiple target support.

Current notes/audit/admin override support:

- `audit_events` and `admin_override_events` are append-only operational records.
- There is no dedicated imported historical note/admin note/allocation note table.
- Existing `JudgeNote`, `Award.PrimaryJudgeNotes`, and `Award.SecondaryJudgeNotes` cannot be imported as new audit events because they are historical source facts.

Current billing contact snapshot support:

- Goal 2 added `invoices.billing_name`, `billing_contact_name`, `billing_email`, `billing_phone`, `billing_address_line1`, `billing_address_line2`, `billing_address_line3`, `billing_postcode`, and `billing_region`.
- Runtime submission currently populates lower-env billing name from organisation name only.
- No reusable billing/contact person model exists yet.

Current tests:

- Existing tests cover Cognito-backed session resolution, role assignments, MFA for admins, scoped RBAC, assessor profile/admin workflows, allocation COI flag acknowledgement, Full contact reveal after acceptance, Mystery contact hiding, DB-first assignment role persistence, invoice/billing snapshots, payment events, migration reference safety, and keeping migration metadata out of applicant/judge DTO fixtures.
- Existing tests do not yet cover legacy contacts, legacy user/admin provisioning decisions, old credential non-migration, detailed judge profile migration, judge application/onboarding archive, canonical COI records, text-only COI manual review, emergency contact retention, or imported historical notes.

## Proposed Schema/Model Corrections

Goal 4 should add additive modern tables and mapping rules. Domain tables remain runtime source of truth; migration provenance remains in Goal 1 sidecar tables.

### Contact Model

Add contact records that are independent of login users:

- `contact_profiles`
  - Modern contact/person record for non-auth contacts and optional links to users.
  - Suggested fields: display name, email, phone, mobile, address lines, postcode, job title, organisation name, status, active/deleted timestamps, linked `internal_user_id` nullable, source classification, created/updated timestamps.
  - Status should distinguish active, inactive, deleted, and archive-only imported records without treating deleted historical contacts as live operational contacts.
- `park_contact_assignments`
  - Relationship between `parks` and `contact_profiles`.
  - Suggested fields: `park_id`, `contact_profile_id`, contact role/type, is primary, contact purpose, status, effective dates, visibility/reveal policy, created/updated timestamps.
  - Use for current park contacts and visit contacts where a reusable live contact is appropriate.
- `organisation_contact_assignments`
  - Relationship between `organisations` and `contact_profiles`.
  - Use for organisation admins, operator contacts, finance contacts, and approved organisation contacts without assuming login access.
- `application_contact_snapshots`
  - Immutable or append-only application/episode contact snapshots.
  - Suggested roles: `SITE_CONTACT`, `PRIMARY_APPLICATION_CONTACT`, `SECONDARY_APPLICATION_CONTACT`, `VISIT_CONTACT`, `BILLING_CONTACT`.
  - Store denormalized contact name, email, phone, mobile, address, job title, organisation, source, source timestamp, and optional links back to `contact_profiles`.
  - Use these snapshots for migration of `ParkAwardApplication.ContactName/TelNo/Email`, primary/secondary application contact details, and contact details that must remain true to the application submission.
- `invoice_contact_snapshot_source`
  - Do not duplicate Goal 2 invoice columns unless needed. Prefer using existing invoice billing columns as the immutable invoice-time destination.
  - Optional link from `application_contact_snapshots` to `invoices` only when implementation needs traceability between application billing input and invoice snapshot.

Legacy mapping:

- `Contact` maps to `contact_profiles` when active/current/useful, otherwise `migration_archive_records`.
- `ParksContact` maps to `park_contact_assignments`, with orphan/missing park/contact relationships reported through reconciliation.
- `AdditionalField`, `AdditionalFieldData`, and `ContactTypeAdditionalField` stay archive-first until definitions are explicitly classified. Unknown definitions must block passed reconciliation.
- `ParkAwardApplication` contact fields map to `application_contact_snapshots` and optionally `application_field_values` for existing application section compatibility.
- Inactive/deleted contacts should be archive-only or inactive contact profile records, not active login users.
- A contact row with an email matching a user/judge/admin can link to `internal_users`, but the contact record must not by itself grant login or role assignment.

### User/Admin Identity Mapping

Add source catalog and mapping rules for identity/auth tables not fully covered by Goal 1:

- `Administrator`
- `AdministratorCountry`
- `User`
- `ValidationToken`
- `UserBlock`
- `ApiAuth`
- `cmsMember`
- `umbracoUser`
- `umbracoTwoFactorLogin`
- selected Umbraco login/session/external-token tables only where archive/provisioning evidence is required.

Modern destinations:

- `Administrator` maps to `internal_users`, `cognito_identity_links` after approved Cognito provisioning, and `role_assignments`.
- `AdministratorCountry` maps to `role_assignments` with `COUNTRY` scope after country reference mapping. If legacy country IDs cannot map to a modern country/scope, create blocker reconciliation items.
- `User` maps to approved Cognito/internal-user provisioning decisions and scoped `role_assignments` only where the user remains operational.
- `ValidationToken` is not migrated as a live token. It can be archived as account verification/reset history only if retention/legal requires it.
- `UserBlock` is security/archive evidence. It may inform provisioning risk review, account-disabled decisions, or support history, but not a live blocklist unless identity/security owners approve the mapping.
- `ApiAuth` is archive-only credential risk. Rotate/recreate any API integration credentials in modern secret management.
- `cmsMember`, `umbracoUser`, and `umbracoTwoFactorLogin` are archive/provisioning evidence only. They must not become runtime auth tables.

Required target additions:

- Add `cognito_identity_link` as a migration target entity type with validator against `cognito_identity_links`.
- Consider `identity_provisioning_decision` as an internal/admin target if Cognito provisioning is performed outside this backend and needs import evidence before `cognito_identity_links` exists.

Credential handling:

- Do not migrate old passwords, API passwords, refresh tokens, validation tokens as live credentials, 2FA secrets, session tokens, security stamps, or OpenID tokens.
- Do not include credential values in source fingerprints or reconciliation evidence.
- Reconciliation should prove "no old password/security data migrated" through sanitized metadata, row counts, archive references, and explicit non-migration records.

### Judge Profile Migration Coverage

Use `assessor_profiles` and related tables as the runtime source of truth. Do not add a separate legacy `Judge` runtime model.

Add profile-detail coverage, preferably through an assessor one-to-one detail table so public/judge DTO exposure stays deliberate:

- `assessor_profile_details`
  - Suggested fields:
    - first name, surname, display name source
    - alternate email
    - mobile, daytime phone, evening phone
    - address lines, postcode
    - alternative address/postcode
    - allocation postcode
    - latitude, longitude, base location source
    - nearest town
    - travel radius
    - travel restrictions
    - preferred judging region
    - other regions available
    - country/region availability
    - willing to judge other sites
    - ID card issued
    - induction/training/accreditation source fields
    - legacy judge status and judging status mapping output
    - experience/specialisms JSON or normalized specialism rows
    - LastDeclinedDate
    - active/deleted dates
  - Keep `UserAccessLevel` as legacy permission/archive evidence unless an approved mapping creates modern `role_assignments`.
- Extend `assessor_preferences` or add `assessor_preference_details` for:
  - travel radius/restrictions
  - mystery shopper flag
  - mystery capacity/preferences
  - preferred regions and other available regions
  - willing to judge other sites
- Extend `assessor_capacity_declarations` or add a capacity detail table for legacy prepared/allocated counts:
  - Full/Green Flag prepared and allocated counts
  - Green Pennant/Heritage/Group counts as historical capacity evidence while non-standard tracks remain blocked/draft unless KBT approves activation.
  - Mystery prepared/allocated counts.
- Emergency contacts:
  - Add `assessor_emergency_contacts` only if legal/retention approves operational retention.
  - Otherwise archive emergency contact fields in restricted archive with sensitivity `personal_data` or `special_category` if advised by legal.
  - Never expose emergency contact fields in applicant/judge/public DTOs without explicit authorization.

Legacy `Judge.ID` mapping:

- `Judge` source records should link to:
  - `internal_user` where a modern account is provisioned or linked.
  - `cognito_identity_link` where provisioning is complete.
  - `role_assignment` for the modern `JUDGE` role at approved scope. Do not create global primary/secondary roles.
  - `assessor_profile`.
  - `assessor_preference`.
  - `assessor_capacity_declaration`.
  - optional `assessor_profile_detail`.
  - optional emergency contact target or archive record.
- Duplicate people by email/name/postcode should become reconciliation report items requiring manual review.

LANTRA:

- LANTRA remains external/future adapter unless already implemented by a separate approved goal.
- Legacy status/training/accreditation fields may initialize internal status/accreditation placeholders, but production truth and synchronization require identity/accreditation owner approval.

### JudgeApplication and Onboarding Coverage

Add a restricted onboarding/archive model unless product explicitly approves an operational judge application review workflow.

Recommended table:

- `assessor_onboarding_records`
  - Suggested fields:
    - `assessor_profile_id` nullable
    - `internal_user_id` nullable
    - source applicant names/email/postcode/country
    - status: submitted, approved, declined, archived, requires_review
    - submitted/approved/declined timestamps
    - decision source
    - notes sanitized or archived
    - source created/import timestamps
    - visibility/admin-only flags

Mapping:

- `JudgeApplication.ID` links to `assessor_onboarding_records`.
- `Judge.JudgeApplicationID` links the `Judge` source row to the onboarding record through `migration_entity_links`.
- Approved applications can link to `assessor_profile` if a judge profile exists.
- Declined/unlinked applications can remain onboarding archive/evidence, not active assessor profiles.
- If no MVP operational workflow is approved, keep onboarding records admin/internal and read-only with product/legal signoff.

Document filename fields:

- Do not implement document storage in Goal 4.
- Goal 4 should define owner/link rules for Goal 3:
  - `Judge.PersonalPhotoFileName` -> assessor profile photo document/media target or restricted archive.
  - `Judge.CVFileName` -> assessor profile/onboarding CV document.
  - `Judge.ApplicationFilename` -> assessor onboarding application document.
  - `Judge.CoverLetterFilename` -> assessor onboarding cover letter.
  - `JudgeApplication.CVFileName` -> onboarding CV document.
  - `JudgeApplication.ApplicationFilename` -> onboarding application document.
  - `JudgeApplication.CoverLetterFilename` -> onboarding cover letter.
- Goal 3 should own document subtype taxonomy, storage key, checksum, signed access, archive path, and missing-file reconciliation.

### Conflict Of Interest Coverage

Current `allocation_coi_flags` should remain the allocation candidate/read-model flag surface. It is insufficient as the canonical persistent COI migration destination.

Add canonical COI records:

- `conflict_of_interest_records`
  - Suggested fields:
    - `assessor_profile_id`
    - conflict type/category: hard, self_declared, admin_set, same_operator, soft, rotation, legacy_text
    - severity: hard_exclude, soft, deprioritise
    - status: active, inactive, deleted, requires_review, superseded
    - source owner
    - source format
    - source label
    - sanitized raw legacy conflict text or text checksum plus archive reference
    - normalized/parsed text
    - active/deleted dates
    - created/updated timestamps
    - manual review outcome and reviewer fields if approved
- `conflict_of_interest_targets`
  - Suggested fields:
    - COI record id
    - target type: park, organisation, country/region, free_text_unresolved
    - `park_id` nullable
    - `organisation_id` nullable
    - normalized target text
    - resolution confidence
    - manual review status

Runtime usage:

- Candidate generation should derive or materialize `allocation_coi_flags` from active canonical COI records plus rotation rules.
- Hard COI must never appear in candidates.
- Soft COI must appear with explanation and require acknowledgement before hold/reassignment.
- Text-only COI with no resolved target must not be silently ignored. It should either:
  - be hard excluded from all allocation candidates for that assessor until reviewed, or
  - block passed reconciliation and require manual resolution before go-live.
  - The exact default requires COI owner approval; the conservative implementation should fail closed for unresolved high-risk text.

Legacy `JudgeConflictOfInterest`:

- Row counts must reconcile.
- Raw text should be sanitized and archived, not exposed in ordinary DTOs.
- Where text can be machine-resolved to park/org, create `conflict_of_interest_targets` with confidence.
- Where not resolvable, create manual review report items and do not pass reconciliation.
- Active/deleted flags and dates must map to status/effective dates.

### Judge Notes and Allocation Notes

Add imported historical note support:

- `imported_historical_notes`
  - Suggested fields:
    - note subject type: assessor_profile, onboarding, allocation, judge_assignment, assessment_episode, application, award/archive
    - subject id nullable when archive-only
    - source table/field classification
    - source created date
    - imported note text or archive reference
    - note classification: judge_note, primary_judge_note, secondary_judge_note, allocation_note, admin_note, assessment_note, archive_only
    - visibility: admin_internal, assessor_admin, archive_restricted
    - sensitivity
    - imported_at

Classification:

- `JudgeNote` -> historical note linked to assessor profile, legacy award/application/allocation where resolvable; otherwise archive-only.
- `Award.PrimaryJudgeNotes` -> imported primary assignment/allocation note linked to `judge_assignment` with `assignment_role = PRIMARY_JUDGE` where resolvable.
- `Award.SecondaryJudgeNotes` -> imported secondary assignment/allocation note linked to `judge_assignment` with `assignment_role = SECONDARY_JUDGE` where resolvable.
- Assessment notes that correspond to scoring/feedback should coordinate with assessment/result import plans and not leak raw scores to applicants.
- Do not import historical notes as new `audit_events`; use source provenance and imported note timestamps.

### InvoicingOrganisation and Billing Contact Coordination

Goal 2 already adds finance facts and archive-first catalog/mapping for `InvoicingOrganisation` and `InvoicingOrganisationTeam`.

Goal 4 classification:

- `Invoice` contact/billing fields -> existing `invoices` billing snapshot columns plus optional `application_contact_snapshots` for billing source if required.
- `InvoicingOrganisation.Name/Address/MainPhone/MainEmailAddress/Website` -> finance/operator/contact input requiring KBT Finance/product ownership before runtime use.
- `InvoicingOrganisationTeam` names/email/phone -> possible `contact_profiles` plus `organisation_contact_assignments` with finance/operator role only if KBT Finance approves operational use.
- `Logo`, `MapPinLogo`, `KeyDates`, `Training`, `GuidanceManualPath`, `FilBookUrl`, `FeeText`, `HideFeeTable`, and similar content -> archive-first or CMS/content-owner decision. Do not turn these into public CMS/backend content by default.
- Public/operator team content must remain archive-only until content ownership, visibility, and legal wording are approved.

## Proposed Service/Repository Changes

Implementation-time changes should be scoped and DB-first:

- Add contact repositories for admin/internal contact management and migration import linking.
- Add contact read helpers for park/organisation/application/invoice contact snapshots.
- Update allocation assignment read models so Full Assessment contact reveal uses real application/visit contact snapshots once reveal is permitted. Mystery remains hard false.
- Add assessor profile detail repository methods for admin-only detailed judge data. Keep self-service profile exposure limited unless explicitly approved.
- Add onboarding archive/review repository methods if product approves an operational admin onboarding read model.
- Add canonical COI repository methods:
  - create/update/archive COI records;
  - resolve target links;
  - generate allocation flags from active COI;
  - require manual review for unresolved text;
  - prevent hard COI from entering candidates.
- Add imported historical note repository methods with source provenance and restricted visibility.
- Add migration import/reconciliation helpers that register Goal 4 source records, links, archive records, and reports using Goal 1 services.
- Add identity provisioning import helpers only around approved Cognito process outputs. The backend should not process or store legacy passwords/secrets.

Do not:

- Recreate legacy auth tables.
- Add primary/secondary/Mystery as global user roles.
- Put lifecycle state back into `applications.status`.
- Make migration provenance visible in ordinary operational DTOs.
- Treat contact rows as login users by default.

## Proposed Contract/API/Read-Model Changes

Plan only the minimum API/read-model changes needed for admin/internal operations. No frontend implementation is part of Goal 4.

Potential admin/internal read models:

- Admin contact management/read model:
  - list/search contact profiles;
  - park/organisation assignments;
  - status and source classification;
  - no migration source IDs in ordinary payloads unless a restricted migration admin endpoint is approved.
- Park/organisation contact read model:
  - current operational contacts;
  - contact role/type;
  - status;
  - reveal policy.
- Application contact snapshot read model:
  - primary/secondary/site/visit/billing application snapshots;
  - admin/applicant-visible as appropriate;
  - immutable application-time source.
- Assessor profile admin read model:
  - profile details, preferences, status, accreditation/training indicators, capacity/availability, travel constraints, and document/onboarding links where approved.
- Judge onboarding/archive read model:
  - submitted/approved/declined dates, status, notes summary, country, linked assessor profile, and document link placeholders coordinated with Goal 3.
- COI management/admin read model:
  - canonical COI records, target resolution, severity/status, manual review state, source owner/format.
- Allocation candidate COI explanation read model:
  - explain soft/deprioritise flags safely;
  - never include raw unresolved legacy COI text where not appropriate.
- Billing contact/admin finance read model:
  - existing invoice billing snapshots and contact sources;
  - finance-only role visibility.

DTO restrictions:

- Applicant, judge, and public DTOs must not expose:
  - migration provenance;
  - old auth IDs;
  - old passwords/security data;
  - emergency contacts unless explicitly authorized;
  - raw COI text where not appropriate;
  - Mystery assignment/contact details before reveal;
  - source-cycle internals that reveal Mystery.
- Any DTO/OpenAPI change needs implementation-time contract review and tests.

## Goal 1 Migration-Layer Usage

Goal 4 must use the sidecar migration layer for provenance and reconciliation. Domain tables should not become legacy-ID ledgers.

Source catalog additions/updates:

- Add missing source tables:
  - `Administrator`
  - `AdministratorCountry`
  - `User`
  - `ValidationToken`
  - `UserBlock`
  - `ApiAuth`
  - `cmsMember`
  - `umbracoUser`
  - `umbracoTwoFactorLogin`
  - selected Umbraco login/session/external-token tables if archive/legal requires.
- Confirm/update existing Goal 1 source catalog entries for:
  - `Contact`
  - `ParksContact`
  - `Judge`
  - `JudgeApplication`
  - `JudgeConflictOfInterest`
  - `EmailLog`
  - `Invoice`
  - `InvoicingOrganisation`
  - `InvoicingOrganisationTeam`
  - `AdditionalField`
  - `AdditionalFieldData`
  - `ContactTypeAdditionalField`

Target entity type additions:

- `cognito_identity_link`
- `contact_profile`
- `park_contact_assignment`
- `organisation_contact_assignment`
- `application_contact_snapshot`
- optional `assessor_profile_detail`
- optional `assessor_emergency_contact` if retained
- `assessor_onboarding_record`
- `conflict_of_interest_record`
- `conflict_of_interest_target`
- `imported_historical_note`

Mapping rule versions:

- Use `goal-4-contact-judge-coi-migration.v1` for Goal 4-specific rules.
- Keep `legacy-field-mapping.v1` as the existing cross-goal field classification manifest, extending it only at implementation time after contract review.
- Do not overwrite Goal 2 mapping rules for finance; add Goal 4 contact/person rules that coordinate with them.

Required reconciliation reports/items:

- Contact row counts.
- ParksContact relationship counts.
- AdditionalField classification, including blockers for unknown definitions.
- Administrator/AdminCountry mapping counts and country-scope resolution.
- User/member provisioning/archive decisions.
- No-password/no-credential migration evidence.
- Judge row counts.
- JudgeApplication row counts.
- Judge to internal user and assessor profile links.
- JudgeApplication to onboarding and judge/assessor links.
- JudgeConflictOfInterest row counts.
- Unresolved COI text/manual review.
- Missing park/org targets for COI.
- Duplicate people by email/name/postcode.
- Orphan contact relationships.
- Missing billing contact destinations.
- Emergency contact retention decisions.
- Judge document source links coordinated with Goal 3.
- Source-to-target and target-to-source traceability for every imported/linkable row.

Archive handling:

- Use `migration_archive_records` for archive-only legacy auth, inactive/historical contacts, raw COI text where restricted, historical notes where no safe operational target exists, rejected/declined onboarding evidence, and finance/operator content pending ownership.
- Sensitivity must be `personal_data`, `special_category`, or `secret_or_credential` as appropriate.
- Do not store raw EmailLog bodies, old passwords, tokens, document contents, unrestricted source rows, or sensitive file paths in fingerprints/report items.

## Goal 2 Finance/Billing Coordination

Goal 2 owns invoice facts, lines, payment events, fee schedules, and finance export boundaries.

Goal 4 should:

- Populate or reconcile invoice billing/contact snapshots from `Invoice` and application/contact sources.
- Decide whether `InvoicingOrganisationTeam` creates finance-only `contact_profiles` and `organisation_contact_assignments`, or remains archive-only.
- Keep `InvoicingOrganisation` operator/team/content fields archive-first until KBT Finance/product/content owners approve runtime/public use.
- Ensure billing snapshots are immutable once issued/imported, consistent with Goal 2 invoice immutability.
- Add reconciliation for invoice rows with missing billing contact destinations or inconsistent billing name/email/phone/address.
- Avoid treating finance content/team data as public CMS/backend content.

Goal 2 remains owner of:

- Money totals and tax/currency facts.
- Invoice lines.
- Payment events.
- Finance export run status.
- Business Central integration boundary.
- Invoice artifacts/PDF coordination with Goal 3.

## Goal 3 Document Coordination

Goal 3 owns document asset/subtype/storage/archive support. Goal 4 owns relationship decisions.

Goal 4 link rules for judge documents:

- `Judge.PersonalPhotoFileName`
  - Owner context: assessor profile.
  - Target: Goal 3 assessor profile photo/media or restricted archive.
  - Visibility: admin/internal by default; public/judge-visible only if approved.
- `Judge.CVFileName`
  - Owner context: assessor profile or onboarding record.
  - Target: Goal 3 judge CV document subtype.
- `Judge.ApplicationFilename`
  - Owner context: onboarding record.
  - Target: Goal 3 judge application document subtype.
- `Judge.CoverLetterFilename`
  - Owner context: onboarding record.
  - Target: Goal 3 judge cover letter document subtype.
- `JudgeApplication.CVFileName`
  - Owner context: onboarding record.
  - Target: Goal 3 judge CV document subtype.
- `JudgeApplication.ApplicationFilename`
  - Owner context: onboarding record.
  - Target: Goal 3 judge application document subtype.
- `JudgeApplication.CoverLetterFilename`
  - Owner context: onboarding record.
  - Target: Goal 3 judge cover letter document subtype.

Goal 4 reconciliation should report the source filename fields and expected relationship owner, but Goal 3 should reconcile actual storage key, checksum, subtype, retention, and missing file/archive outcomes.

## Proposed Tests

Identity/security tests:

- Old password/API credential/2FA secret/session/token fields are not migrated into runtime tables, DTOs, source fingerprints, or report evidence.
- `Administrator` maps to `internal_users`, `cognito_identity_links`, and scoped role assignment after approved provisioning output exists.
- `AdministratorCountry` maps to `COUNTRY` scope and blocks reconciliation when country mapping is missing.
- `User`, `cmsMember`, and `umbracoUser` records produce provisioning/archive decisions without copying old credentials.
- `ValidationToken`, `UserBlock`, `ApiAuth`, `umbracoTwoFactorLogin`, and session/token tables remain archive-only or non-live evidence.
- Role assignments remain scoped; no primary/secondary/Mystery global user roles are created.

Contact tests:

- `Contact` and `ParksContact` map to `contact_profiles` and relationship destinations or archive records.
- Application primary/secondary/site contact snapshots map correctly from `ParkAwardApplication` fields.
- Registration contact fields can create/associate modern contact records without making every contact a login user.
- Billing/invoice contact snapshots coordinate with Goal 2 invoice columns.
- AdditionalField unknown definitions block passed reconciliation until classified.
- Inactive/deleted contacts are inactive/archive-only and not operationally exposed as active contacts.
- Orphan contact relationships generate reconciliation report items.

Judge profile tests:

- Legacy `Judge.ID` maps to internal user, role assignment, assessor profile, profile details, preferences, and capacity destinations as applicable.
- Status/accreditation/training/induction fields map to approved modern statuses or manual review/archive outcomes.
- Travel radius, travel restrictions, preferred region, other regions, country availability, mystery preference/capacity, and prepared/allocated counts are preserved in approved destinations.
- Duplicate judges by email/name/postcode generate manual review items.
- Emergency contact retention decision is enforced: either restricted retained target or archive-only with no public/judge/applicant exposure.
- `UserAccessLevel` is archive/permission evidence unless explicitly mapped to role assignments.

JudgeApplication/onboarding tests:

- `JudgeApplication.ID` maps to onboarding/archive evidence.
- Submitted/approved/declined dates, approval status, notes, country, and `Judge.JudgeApplicationID` links reconcile.
- Declined/unlinked applications do not create active assessor profiles unless approved.
- Judge document filename links point to Goal 3 document targets/archive records.

COI/allocation tests:

- Legacy `JudgeConflictOfInterest` row counts reconcile.
- Hard COI records are excluded from allocation candidates and cannot be held/reassigned.
- Soft COI appears with acknowledgement requirement before assignment.
- Text-only legacy COI requires manual review where no park/org target can be resolved.
- Unresolved high-risk COI fails closed according to approved COI-owner policy.
- `allocation_coi_flags` can be regenerated/materialized from canonical active COI records.
- Existing RBAC/Mystery/allocation tests remain green.
- Primary/secondary assignment roles from Goal 5 remain assignment-level.
- Mystery reveal remains hard false.
- Full reveal still depends on all required participants accepting.

Notes/audit tests:

- `JudgeNote`, `Award.PrimaryJudgeNotes`, and `Award.SecondaryJudgeNotes` import as historical notes/archive, not new `audit_events`.
- Imported notes retain source provenance and visibility/sensitivity classification.
- Admin override and audit tables remain append-only.

DTO/read-model tests:

- Applicant/judge/public DTOs do not expose migration metadata, old auth IDs, old passwords/security data, raw unresolved COI text, emergency contacts, or restricted personal data.
- Allocation candidate explanations contain safe COI summaries only.
- Admin/internal read models expose restricted data only through approved RBAC.
- Billing contact/admin finance read models do not leak finance-only/operator content to public surfaces.

Migration/reconciliation tests:

- Goal 1 reconciliation reports cover counts, missing target, orphan, duplicate, manual review, archive-only, unresolved COI, missing billing contact, and emergency-retention outcomes.
- Source-to-target and target-to-source traceability works for contact, user/admin, judge, onboarding, COI, historical note, and billing contact links.
- Confirmed links fail when targets are missing.
- Unclassified source tables/fields cannot produce passed reconciliation or confirmed links.

## Risks / Open Decisions

- Cognito provisioning/import process:
  - Need identity owner-approved flow for creating or linking users.
  - Need treatment for duplicate emails and inactive/deleted accounts.
  - Need confirmation of admin/judge MFA policy during cutover.
- Contact retention/legal:
  - Need retention schedule for active, inactive, deleted, archive-only, and public contact data.
  - Need decision on whether historical contact rows remain queryable or archive-only.
- Emergency contact retention:
  - Need legal basis and access model before retaining emergency contacts operationally.
- COI source owner/format:
  - Need owner of live COI register and rules for text-only conflicts.
  - Need default fail-closed behavior for unresolved legacy COI.
- JudgeApplication/onboarding product scope:
  - Need decision whether MVP has an operational judge application review workflow or only admin archive/onboarding evidence.
- Judge document ownership with Goal 3:
  - Need approved document subtype taxonomy, retention, storage, and access decisions.
- Billing contact ownership with Goal 2:
  - Need finance ownership for invoice contact snapshot source precedence and operator/team content usage.
- Old auth/archive retention:
  - Need legal/security decision for old auth records, tokens, failed logins, lockouts, and 2FA secret archive or destruction.
- Public/operator team content:
  - Need content owner approval before any `InvoicingOrganisation` or team content becomes runtime/public content.
- Goal 3 boundary:
  - Document storage/subtype/archive implementation belongs to Goal 3, not Goal 4.

## Items Blocked By KBT/Legal/Identity/COI Input

- Approved Cognito provisioning/import process and duplicate identity resolution.
- Country mapping from legacy `AdministratorCountry.CountryID` to modern country scope IDs/codes.
- Whether legacy `UserBlock` should affect provisioning decisions or remain archive-only.
- Retention/legal basis for deleted contacts, inactive contacts, and emergency contacts.
- COI source owner, source file/register format, severity mapping, and unresolved text policy.
- Whether text-only COI should hard-exclude globally until reviewed.
- Judge status/training/accreditation mapping and LANTRA synchronization posture.
- Whether JudgeApplication becomes a live review workflow or archive/onboarding evidence only.
- Whether legacy finance/operator/team content is finance-only, public content, CMS-owned, or archive-only.
- Whether any old EmailLog recipient/contact history should become notification history vs archive-only.

## Items That Must Remain Archive-Only

- Old passwords from `User`, `cmsMember`, `umbracoUser`, or any legacy auth table.
- `ApiAuth.Password`, refresh tokens, API usernames/passwords, and legacy API credentials as live values.
- `umbracoTwoFactorLogin.secret`.
- OpenID/session/security stamp/token tables as live auth state.
- `ValidationToken.Token` as a live token.
- Raw EmailLog bodies and unrestricted message bodies unless a restricted archive/legal decision approves retention.
- Raw unresolved COI text in ordinary DTOs.
- Emergency contact fields unless legal/retention approves operational retention.
- Inactive/deleted contacts with no approved operational use.
- `InvoicingOrganisation` public/operator/team content until finance/product/content ownership approves runtime use.
- `UserAccessLevel` as runtime permission unless explicitly mapped to modern role assignments.
- Legacy primary/secondary judge role concepts as global user roles.

## Acceptance Criteria For Implementation

Implementation is acceptable when all of the following are true:

- Only modern additive schema is introduced; no legacy auth table recreation occurs.
- Cognito remains the identity provider; PostgreSQL identity records remain keyed to Cognito identities.
- Old passwords, API credentials, refresh tokens, 2FA secrets, validation/session tokens, and security stamps are not migrated as runtime data.
- Contact profiles and relationships exist independently from login users.
- Park, organisation, application, visit, and billing contact destinations are defined and reconciled.
- Application primary/secondary contact snapshots are immutable or source-preserving and traceable.
- Legacy `Contact`, `ParksContact`, `AdditionalField`, `AdditionalFieldData`, and `ContactTypeAdditionalField` have mapping/archive/reconciliation coverage.
- Legacy `Administrator`, `AdministratorCountry`, `User`, `ValidationToken`, `UserBlock`, `ApiAuth`, `cmsMember`, `umbracoUser`, and `umbracoTwoFactorLogin` have explicit migrate/link/archive/exclude decisions.
- Legacy `Judge` rows map to internal users, assessor profiles, profile details, preferences, capacities, role assignments, and archive records as applicable.
- Legacy `JudgeApplication` rows map to onboarding/archive evidence and link to judge/assessor profiles where applicable.
- Judge document filename links are defined for Goal 3 and reconciled as relationship evidence.
- Canonical COI records support hard/soft/source/severity/status, target resolution, raw legacy text archive, active/deleted dates, and manual review.
- Hard COI never appears in allocation candidates.
- Soft COI requires acknowledgement before assignment.
- Unresolved text-only COI cannot silently pass migration.
- Historical notes import as historical notes/archive with source provenance, not as new audit events.
- Goal 2 invoice billing snapshots remain immutable and finance/operator content remains archive-first unless ownership is approved.
- Goal 1 reconciliation reports prove counts, duplicates, missing targets, orphan relationships, unresolved manual review, archive-only handling, no-password migration, emergency-contact decisions, and traceability.
- Applicant, judge, and public DTOs do not expose migration provenance, old auth/security data, emergency contacts, raw COI text, or Mystery/source-cycle internals.
- Existing DB-first, RBAC, Mystery redaction, allocation, finance, migration-reference, and contract tests remain green.
