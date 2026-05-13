# Closeout Pass A Security/DTO/RBAC Report

Date: 2026-05-08

## Summary

Implemented Closeout Pass A for security-facing DTO safety, signed document access audit, tuple-aware authorization, admin communications/job/export scoping, and read-only/cross-scope denial evidence.

This pass did not add frontend work, provider integrations, official scoring/bands, fee/VAT/legal content, legacy schema cloning, or lifecycle state in `applications`. Existing DB-first repository paths remain in place.

## Repository status

Before implementation, `git status --short` showed a pre-existing dirty workspace with modified backend/docs files and many untracked Pass 1/2/S09-S14 reports, repositories, migrations, and output artifacts. Notable pre-existing entries included modified `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/postgres-runtime.ts`, `apps/api/src/runtime-safety.ts`, `apps/api/src/postgres-domain-stores.integration.test.ts`, and untracked `apps/api/src/postgres-domain-stores/communications-repository.ts` / `results-repository.ts`.

After implementation, the workspace remains dirty and now also includes this report:

- `docs/implementation/working/closeout-pass-a-security-dto-rbac-report.md`

Files intentionally changed for this pass:

- `packages/contracts/src/schemas.ts`
- `packages/contracts/src/fixtures.ts`
- `packages/contracts/src/contracts.test.ts`
- `openapi/openapi.json`
- `apps/api/src/authorization.ts`
- `apps/api/src/redaction.ts`
- `apps/api/src/applicant/documents.service.ts`
- `apps/api/src/applicant/routes.ts`
- `apps/api/src/postgres-domain-stores/applicant-repository.ts`
- `apps/api/src/communications.ts`
- `apps/api/src/postgres-domain-stores/communications-repository.ts`
- `apps/api/src/assessment.ts`
- `apps/api/src/postgres-domain-stores/assessment-repository.ts`
- `apps/api/src/results/routes.ts`
- `apps/api/src/postgres-domain-stores/results-repository.ts`
- `apps/api/src/applicant.test.ts`
- `apps/api/src/communications.test.ts`
- `apps/api/src/hardening.test.ts`
- `apps/api/src/postgres-domain-stores.integration.test.ts`
- `apps/api/src/admin.test.ts`
- `apps/api/src/allocation.test.ts`

## Contract and OpenAPI changes

- Added applicant-safe document DTOs:
  - `applicantDocumentAssetSchema`
  - applicant-facing `ApplicationDocumentsResponse`
  - applicant-facing `CompleteDocumentUploadResponse`
  - applicant-facing `DocumentVersionsResponse`
- Added applicant-safe message DTOs:
  - `applicantMessageThreadSchema`
  - `applicantMessageEntrySchema`
  - `applicantMessageThreadsResponseSchema`
  - `applicantMessageCommandResponseSchema`
- Updated applicant result certificate projection to expose `certificateId` and `downloadAvailable` only; no storage provider is exposed.
- Preserved admin/internal/judge operational DTOs:
  - `documentAssetSchema`
  - `messageThreadSchema`
  - `messageEntrySchema`
  - `judgeAssessmentSchema`
  - `assessmentEvidenceSchema`
  - `decisionResultSchema`
  - `resultArtifactSchema`
  - notification/job/export schemas
- Updated `openapi/openapi.json` for applicant document and applicant message safe response schemas.

Compatibility impact: applicant document and applicant message API consumers must stop relying on storage/provider fields, `uploadedByActorId`, `participantActorIds`, `senderActorId`, and `visibleToApplicant` on applicant-facing responses. No frontend files were edited.

## Endpoint surfaces changed

Applicant/org/public-safe surfaces hardened:

- `GET /api/v1/applicant/applications/:applicationId/documents`
- `POST /api/v1/applicant/applications/:applicationId/documents/upload-sessions/:sessionId/complete`
- `GET /api/v1/applicant/applications/:applicationId/documents/:documentId/access`
- `GET /api/v1/applicant/applications/:applicationId/documents/:documentId/versions`
- `GET /api/v1/applicant/messages`
- `POST /api/v1/applicant/messages`
- `GET /api/v1/applicant/results/:episodeId`

Admin/internal/judge surfaces preserved as operational and route-protected:

- assessor assessment reads/commands
- admin assessment detail
- admin result detail and result commands
- admin messages
- notification queue/logs
- jobs/job runs
- exports

Applicant/org/public fields removed from safe projections:

- Documents: `storageProvider`, `storageKey`, object-key-shaped values, provider payloads, `uploadedByActorId`, internal storage metadata.
- Messages: `participantActorIds`, `senderActorId`, `visibleToApplicant`, suppression internals, Mystery metadata.
- Results: raw score fields, internal notes, storage provider/key fields, evidence/message internals, judge/visit/assignment internals.

## Signed document access audit

- Added PostgreSQL repository method `requestSignedDocumentAccess`.
- The method loads the document, enforces visibility, builds the existing lower-env access response, and appends `DOCUMENT_ACCESS_REQUESTED`.
- Map fallback signed-access route now also appends the same audit event before returning access.
- Audit metadata includes document id, application id, episode id, park id, document type, visibility, and access decision.
- Audit metadata intentionally excludes storage key, object key, bucket, provider payload, and signed URL internals.
- Access is fail-closed: if audit append fails, no signed/lower-env access response is returned.
- No S3, scanning, or signed URL provider was implemented.

## RBAC tuple hardening

- Added tuple-aware helpers in `apps/api/src/authorization.ts`:
  - active role-assignment inspection
  - `hasSuperAdminGlobalAccess`
  - `hasRoleAssignmentForResource`
  - role-specific applicant/operational/payment checks
  - `requireMutationAllowed`
- Hardened endpoints now evaluate role + scope together instead of using primary role plus unrelated merged scopes.
- `SUPER_ADMIN + GLOBAL` remains global.
- `READ_ONLY_VIEWER` is denied mutation helpers.
- Judge assessment access now checks active judge role assignment and existing assignment ownership/status.
- Existing session shape is preserved for compatibility.

## Admin communications/jobs/exports scoping

- Admin messages are scoped by thread park/episode ownership for KBT/organisation-scoped access; finance admins do not see broad operational message threads.
- Notification queue/log listing filters by related entity ownership when available; rows with unresolved ownership are visible only to Super Admin or the exact recipient actor where explicitly safe.
- Job listing is global only for Super Admin. Non-Super Admin job rows without resolvable ownership fail closed to an empty list.
- Export creation is restricted by export type: Finance Admin may create payment exports only; result/application/public-map exports require operational admin or Super Admin.
- Export listing is global only for Super Admin; non-Super Admin users only see exact actor-created rows allowed for their role/export type.

## Mystery and redaction behavior

- Mystery applicant documents remain suppressed in applicant document projections.
- Mystery applicant/admin-created message threads remain suppressed from applicant listings.
- Applicant result projection remains safe and does not expose raw scores, notes, artifacts, evidence, judge, visit, assignment, storage, message, or Mystery internals.
- Admin/internal/judge DTOs retain operational fields only behind protected/scoped routes.

## Tests added/updated

- Contract tests assert applicant document fixtures omit storage/provider/internal actor fields.
- Applicant tests assert document list, upload-complete, versions/access response safety, signed-access audit creation, and audit-failure fail-closed behavior.
- Communications tests assert applicant message command/list responses omit operational metadata.
- Hardening tests cover applicant message safety, read-only viewer mutation denial, mixed role/scope denial, and Finance Admin non-finance denial.
- PostgreSQL integration tests cover signed document access audit creation and safe applicant message command responses.
- Existing admin/allocation tests were updated so session fixtures mutate `roleAssignments` consistently with tuple-based authorization.

## Verification results

All requested commands passed:

- `corepack pnpm lint` - passed
- `corepack pnpm test` - passed, 103 tests passed and DB integration file skipped in normal unit run
- `corepack pnpm db:integration:test` - passed, 25 tests passed
- `corepack pnpm --filter @green-flag/api typecheck` - passed
- `corepack pnpm --filter @green-flag/db typecheck` - passed
- `corepack pnpm db:migrate:check` - passed
- `corepack pnpm db:seed:check` - passed
- `corepack pnpm contracts:check` - passed
- `corepack pnpm openapi:check` - passed

## Remaining caveats

- Existing admin/internal/judge DTOs still intentionally contain operational fields. They are route-protected and must not be reused for applicant/public surfaces.
- No database migration was added; job/export ownership is fail-closed where current rows do not contain enough resource ownership data.
- Frontend consumers of applicant document/message response shapes will need to align with the safe DTOs, but no frontend code was changed in this pass.
- Provider-backed storage, scanning, email/SMS, export delivery, public map dispatch, certificate generation, payment automation, Business Central, and official scoring/finance/legal content remain external or future work.
