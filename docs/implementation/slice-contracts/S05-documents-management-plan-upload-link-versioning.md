# Current Plan

## Metadata

- Slice ID: 5
- Title: Documents and management plan upload/link/versioning
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S05-documents-management-plan-upload-link-versioning.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/figma-snapshot-lock.json
  - docs/implementation/slice-contracts/S00-operating-layer-and-contract-build-baseline.md
  - docs/implementation/slice-contracts/S01-identity-rbac-audit-foundation.md
  - docs/implementation/slice-contracts/S02-organisations-parks-locations-cycles-episodes.md
  - docs/implementation/slice-contracts/S03-registration-eligibility-verification-admin-approval.md
  - docs/implementation/slice-contracts/S04-applicant-dashboard-application-draft-autosave.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
  - docs/implementation/Green_Flag_System_Architecture_Final.docx
  - docs/implementation/Green_Flag_Award_MVP_Implementation_Reference_and_Delivery_Playbook_v1.docx
- Related UI evidence:
  - docs/figma/Applicant - Application - Document.png
  - docs/figma/Applicant - Application - Review & submit.png
  - docs/figma/Applicant - Application - Application details.png
  - docs/figma/Super Admin - Document Archieve.png
  - docs/figma-manifest.json
  - docs/figma-manifest.md

## Objective

Deliver the document and management-plan foundation for Full Assessment applications: create upload sessions, persist file asset metadata, complete chunked uploads through a safe lower-env adapter, detect duplicate SHA-256 files, version/archive replaced management plans, provide signed read access contracts, enforce document visibility rules, and expose applicant-facing document upload UI within the existing application wizard.

This slice is legal because it is the first eligible `TODO` slice after Slice 4, Slice 4 is `DONE_BACKEND`, no active slice exists, and no earlier `BLOCKED` slice precedes Slice 5.

## Primary user/system path

1. An authenticated park manager continues a Full Assessment application draft.
2. The applicant opens the document step and sees required/optional document slots for the application package.
3. The applicant starts an upload for a management plan or supporting document.
4. The backend creates a chunked upload session scoped to the application, actor, document type, expected size, content type, and checksum metadata.
5. The applicant uploads chunks with visible progress and retry-safe chunk acknowledgements.
6. The backend completes the upload, verifies declared file metadata/checksum, detects SHA-256 duplicates, creates a new document asset version, archives superseded versions, and emits audit events.
7. The applicant can list/download only documents visible to their scoped park/application.
8. Admin/judge read access is modeled as signed-access contracts/read models only; full admin queues and judge assessment document usage remain later slices.

## Scope lock

### In scope

- Document/file metadata tables for application documents and management plans.
- Chunked upload session model and retry-safe chunk acknowledgement contract.
- Lower-env storage adapter stub that models object keys, ETags, signed upload/download URLs, and scan status without production credentials.
- SHA-256 duplicate detection for documents within the relevant application/park scope.
- Management plan versioning: current version, archived/replaced versions, uploaded-by actor, timestamps, file metadata, and immutable audit trail.
- Signed access/read URL contracts with short expiry fields and visibility checks.
- Document visibility rules for applicant, organisation admin, super admin, and future judge/admin consumers.
- Applicant document list/upload/download read models.
- Review projection extension showing document completion state without enabling submission.
- Audit events for upload-session create, chunk acknowledgement where state changes, upload completion, archive/replace, delete/withdraw if implemented.
- Shared DTO schemas, fixtures, OpenAPI paths, migrations, seeds, tests, and frontend route updates for the applicant document step.

### Out of scope

- Application submission, invoice creation, payment status, payment blocking, PO/no-PO capture, and payment overrides; these belong to Slice 6.
- Admin application/payment/document operational queues; these belong to Slice 7 except minimal DTO fixtures needed for future compatibility.
- Judge assessment use of documents, offline scoring, visit workflows, and evidence capture; these belong to later assessment slices.
- Production S3 buckets, AWS credentials, real presigned URL generation, real virus-scanner Lambda integration, CDN configuration, and KMS setup.
- Public media/park images, certificates, exports, messaging attachments, score evidence photos, and migration import tooling.
- Community, Heritage, and Group document rules beyond safe placeholders; do not activate unapproved award-type document requirements.

### Forbidden work

- Do not implement submission/payment behavior or make documents trigger submission.
- Do not invent production storage credentials, bucket names beyond lower-env placeholders, virus-scan provider behavior, retention/legal wording, fee/VAT values, or KBT approvals.
- Do not allow raw Mystery Shop metadata or hidden judge/admin documents to appear in applicant document APIs/read models.
- Do not create scoring evidence, result artifact, certificate, message attachment, export, public map, payment, allocation, or assessment tables.
- Do not store raw file bytes in PostgreSQL.
- Do not rely on UI-only hiding for document visibility.

## Source mapping

### Product / domain truth

- PRD actor mapping says park managers apply for awards, upload management plans, view status, download certificates, and receive notifications.
- PRD project context identifies the current 10MB management-plan limit as a pain point, forcing parks to compress documents and email separately.
- Non-functional requirement `NFR-PER-004` requires files up to 50MB, visible upload progress, chunked upload, and clear retry without data loss.
- Award type specifications state Standard Green Flag requires a management plan in Full Assessment years and not Mystery Shop years.
- Source requirements place applicant application document surfaces in `SCR-PRK-03`/application wizard evidence.

### Operational / architecture truth

- `assessment_episodes` remains the operational lifecycle root.
- `applications` owns only applicant package state; documents attach to the Full Assessment applicant package and derive lifecycle context from the application/episode.
- Architecture uses private file storage with signed access patterns; production S3/KMS/Lambda scanner integrations are adapter boundaries, not hardcoded values.
- Backend owns RBAC, redaction, audit, document visibility, duplicate detection, versioning, and API contracts.
- Every data-changing command must emit `audit_events`.

### Platform reality

- S04 delivered applicant application drafts and a disabled document/upload affordance.
- The repo has contract, OpenAPI, migration, seed, lint, test, build, and typecheck commands.
- No document/upload tables or APIs exist yet.
- Existing frontend route `/applicant/applications/[applicationId]` can be extended with the document step.

### Gap register references

- `FE-003`: Document step PNG is available, but dedicated management-plan versioning/link states are not confirmed.
- `FE-001`/`FE-002`: Applicant dashboard and wizard mapping remains partly family-level.
- `EXT-009`: current system export files are unavailable, so migration/import behavior must stay synthetic or future-planned.
- Production storage credentials and infrastructure setup are external and must remain adapter/config boundaries.

## Backend contract

### Data / migration scope

- Add `document_assets` or equivalent immutable file asset metadata:
  - id, application id, assessment episode id, park id
  - document type/category
  - filename, content type, byte size, SHA-256 hash
  - storage key placeholder, storage provider, scan status, visibility, current/archive status
  - version number, replaced-by/replaces references
  - uploaded-by actor, timestamps
- Add `document_upload_sessions`:
  - session id, application id, document type, expected file metadata, total chunks, uploaded chunk count, status, expires at, idempotency key
- Add `document_upload_chunks` or compact chunk receipt representation if useful for retry-safe acknowledgements.
- Add lower-env seed data for one current management plan and one archived prior version.
- Update migration checks to allow only S05 document tables while still blocking payments, allocation, scoring, results, messages, jobs, exports, certificates, and public map tables.

### Commands

- `listApplicationDocuments`
- `createDocumentUploadSession`
- `acknowledgeDocumentUploadChunk`
- `completeDocumentUpload`
- `replaceManagementPlan`
- `archiveDocumentVersion`
- `getSignedDocumentAccess`
- `withdrawDocument` only if needed by product docs; otherwise defer and record as not implemented.

### Queries / read models

- Application document list grouped by required/optional slots.
- Upload session status/progress.
- Document asset/version history for applicant-owned documents.
- Review projection document completion state.
- Signed download/read access response.
- Admin/judge-compatible document visibility DTO fixtures for later slices without implementing full queues.

### State transitions

- Upload session: `CREATED` -> `IN_PROGRESS` -> `READY_TO_COMPLETE` -> `COMPLETED` or `EXPIRED`/`FAILED`.
- Document asset: `UPLOADED_PENDING_SCAN` -> `AVAILABLE` or `REJECTED`.
- Management plan replacement archives previous current version and marks the new version current.
- Application status remains applicant package draft state from S04; no submission/payment/assessment state transitions.

### RBAC / scope

- Park managers can list/upload/replace/read documents only for scoped park applications.
- Organisation admins can act for parks within their organisation scope.
- Super admins can read document metadata for operational support; full admin queue UI remains later.
- Future judge access must be modeled as visibility profiles, but no judge document workflow is implemented.
- All document access checks are server-side.

### Mystery redaction

- Applicant APIs must not expose Mystery-only document slots, hidden judge/admin documents, visit artifacts, assignment metadata, or raw `MYSTERY_SHOP` lifecycle metadata.
- Mystery Shop episodes must not require applicant management plan upload in this slice.
- Signed access must be generated only after visibility and scope checks.

### Audit

- Data-changing commands emit append-only audit events:
  - create upload session
  - acknowledge chunk if persisted
  - complete upload
  - replace/archive document version
  - withdraw/delete if implemented
- Audit includes actor, application, assessment episode, document id/session id, request metadata, idempotency key, before/after state summary, and checksum metadata.

### Error cases

- `unauthorized` for missing/invalid session.
- `forbidden` for actor scope mismatch or visibility violation.
- `validation_failed` for unsupported document type, file size over configured lower-env limit, invalid content type, missing checksum, malformed chunk index, or invalid completion request.
- `dependency_missing` for missing application, episode, document, or upload session.
- `conflict` for invalid upload/document state transitions.
- `idempotency_conflict` for conflicting retry payloads.
- `redaction_blocked` if a document projection would leak Mystery-only metadata.

### Idempotency / retries

- Upload session creation is idempotent per actor/application/document type/idempotency key.
- Chunk acknowledgements are retry-safe and do not double-count already accepted chunks.
- Completion is idempotent when the same uploaded object/checksum is supplied repeatedly.
- Duplicate SHA-256 detection returns an existing duplicate marker or conflict without creating duplicate current versions.

## API / DTO contract

### Endpoints

- `GET /api/v1/applicant/applications/:applicationId/documents`
- `POST /api/v1/applicant/applications/:applicationId/documents/upload-sessions`
- `PATCH /api/v1/applicant/applications/:applicationId/documents/upload-sessions/:sessionId/chunks/:chunkIndex`
- `POST /api/v1/applicant/applications/:applicationId/documents/upload-sessions/:sessionId/complete`
- `GET /api/v1/applicant/applications/:applicationId/documents/:documentId/access`
- `GET /api/v1/applicant/applications/:applicationId/documents/:documentId/versions`

### Request DTOs

- Create upload session: document type, filename, content type, byte size, SHA-256 hash, total chunks, optional idempotency key.
- Acknowledge chunk: chunk size, chunk checksum or ETag placeholder, client session version, optional idempotency key.
- Complete upload: final SHA-256 hash, total byte size, storage object key placeholder or adapter upload token, client session version.
- Signed access request: purpose and optional requested filename.

### Response DTOs

- Document list response with required slots, completion state, current documents, archived versions count, allowed actions.
- Upload session response with session id, status, progress, chunk size, upload URL/template placeholder, expires at, version.
- Chunk acknowledgement response with accepted chunk index, progress, session status, version.
- Upload completion response with document asset, duplicate marker, current/archived state, scan status.
- Signed access response with URL placeholder, method, expiry, filename, content type, and visibility profile.
- Error response using existing project error envelope.

### Mock responses / fixtures

- Current management plan document fixture.
- Archived management plan version fixture.
- Upload session fixture.
- Chunk acknowledgement fixture.
- Duplicate document conflict fixture.
- Signed access fixture with lower-env placeholder URL.
- Mystery-safe document list fixture with hidden fields suppressed.

## Frontend contract

### Available screens

- `docs/figma/Applicant - Application - Document.png`
- `docs/figma/Applicant - Application - Review & submit.png`
- `docs/figma/Applicant - Application - Application details.png`
- `docs/figma/Super Admin - Document Archieve.png`

### Partial screens

- Applicant document step is available in the wizard family, but exact version history, duplicate warning, failure retry, virus-scan pending/rejected, and signed-access states are not separately exported.
- Admin document archive PNG exists, but full admin document archive/queue implementation belongs later unless needed only as DTO/read-model evidence.
- Mobile document upload exports are not confirmed.

### Missing screens

- Exact chunk progress/retry/failure states.
- Exact duplicate-file warning state.
- Exact management-plan version history and archive replacement UI.
- Exact virus-scan pending/rejected UI.
- Exact mobile document upload UI.

### Implement now

- Extend applicant application wizard route with a document step backed by S05 DTO fixtures/API.
- Show required management plan slot, current uploaded document, upload progress/status, and version/archive summary.
- Provide disabled/deferred submission/payment affordances until Slice 6.
- Add route/API smoke checks for applicant document list and upload session flows.

### Stub/mock now

- Use lower-env placeholder upload/download URLs; do not integrate production storage.
- Model scanner states as metadata placeholders, not real virus scanning.
- Version history can be compact if exact UI is absent.
- Duplicate warning can use contract-backed fallback copy until exact PNG evidence arrives.

### Wait for future screens

- Full admin document archive/operational queue.
- Judge/assessor document consumption inside assessment workflows.
- Payment/submission states.
- Public media, certificates, and exports.
- Exact mobile upload screens.

### Reopen triggers

- New or changed applicant document upload step PNGs.
- Exact upload progress/retry/failure/duplicate/scan state screens.
- Exact management-plan version history/archive screens.
- Exact admin document archive screens when Slice 7 scopes admin queues.
- Mobile document upload PNG exports.

## Design coverage check

### Expected UI surfaces for this slice

- Applicant document upload step within application wizard.
- Applicant document/version summary within review/application detail.
- Minimal signed-access/download affordance.

### PNG matches

- Expected surface: applicant document upload
  - Matched PNG: `docs/figma/Applicant - Application - Document.png`
  - Confidence: medium
  - Notes: supports wizard document step; exact upload progress/failure/version states remain missing.
- Expected surface: application review document summary
  - Matched PNG: `docs/figma/Applicant - Application - Review & submit.png`
  - Confidence: low
  - Notes: can shape read-only completion summary only; submission remains out of scope.
- Expected surface: admin document archive
  - Matched PNG: `docs/figma/Super Admin - Document Archieve.png`
  - Confidence: low for S05 implementation
  - Notes: evidence for future admin archive surface; do not implement full admin queue in S05.

### PNG-backed surface inventory

| Surface | Route | PNG path | Viewport / variant | Visual inventory | Approved fallback | Internal-copy rule |
| --- | --- | --- | --- | --- | --- | --- |
| Applicant document step | `/applicant/applications/[id]#documents` | docs/figma/Applicant - Application - Document.png | desktop/applicant wizard | Upload slot, document step layout, action area | Contract-backed upload session/progress card | Do not claim submission/payment behavior |
| Review document summary | `/applicant/applications/[id]#review` | docs/figma/Applicant - Application - Review & submit.png | desktop/applicant wizard | Review shell and completion summary | Read-only document completion state | Do not enable submit |
| Admin document archive evidence | future admin route | docs/figma/Super Admin - Document Archieve.png | desktop/admin | Archive table/list pattern | DTO fixtures only in S05 | Do not implement admin queues |

### Missing or unclear design coverage

- Exact document upload progress, retry, duplicate, scan pending/rejected, version history, and mobile states.
- Whether link-to-existing-management-plan is a distinct UI path or represented by version history.
- Whether applicant document delete/withdraw is required before submission.

### Existing implementation overlap

- S01 actor/session/scope/audit helpers.
- S02 parks/cycles/assessment episodes.
- S04 application draft and applicant wizard route shell.
- Existing disabled document affordance in S04 frontend can be replaced by S05 document step.

### Design traceability

- Surface: applicant document upload
  - Verified route: `/applicant/applications/[id]`
  - PNG: `docs/figma/Applicant - Application - Document.png`
  - Variant notes: desktop wizard family; exact progress/error states absent.
- Surface: document review summary
  - Verified route: `/applicant/applications/[id]`
  - PNG: `docs/figma/Applicant - Application - Review & submit.png`
  - Variant notes: summary only; submit disabled/deferred.

### Visual / route-inspection gates

- Route: `/applicant/applications/11111111-1111-4111-8111-111111111111`
  - Screenshot artifact: required during implementation review if local app runs.
  - Semantic anchors: document step, management plan slot, upload progress/status, current version, archived version count, disabled submit/payment.
  - Negative copy assertions: no production storage/provider copy, no payment/submission claims, no raw Mystery labels.

### Ambiguities requiring user decision

- None blocking backend/API planning. Missing UI states are handled as frontend gaps and fallback states.

### User-approved design decisions

- Use local Figma snapshot because live Figma freshness is unknown and local snapshot is available.
- Keep submission/payment deferred to Slice 6 even though adjacent PNGs exist in the wizard family.
- Treat production storage/virus-scan providers as adapter boundaries and lower-env placeholders in this slice.

### Deferred affordance policy

- Element: submit/payment actions
  - Treatment: disabled
  - Notes: Slice 6 owns submission and payment.
- Element: full admin document archive
  - Treatment: DTO fixture / future evidence only
  - Notes: Slice 7 owns admin queues.
- Element: real storage and virus scanning
  - Treatment: lower-env adapter stub
  - Notes: production provider credentials/configuration are external.

## Planned file zones

Advisory only; implementation may choose better locations if repo conventions require it.

- apps/api/src/**
- apps/web/app/applicant/**
- apps/web/app/globals.css
- packages/contracts/src/**
- packages/db/src/**
- packages/db/migrations/**
- packages/db/seeds/**
- packages/db/scripts/check-migrations.mjs
- openapi/**
- docs/implementation/working/**
- docs/implementation/slice-contracts/**
- docs/implementation/delivery-records/**

## Verification matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| Repo/app scaffold check | inspect root/apps/packages files | Pending | Confirm S04 scaffold remains intact |
| Backend lint | `corepack pnpm lint` | Pending | Must pass or record exact failure |
| Backend typecheck | `corepack pnpm typecheck` | Pending | Must pass or record exact failure |
| Backend tests | `corepack pnpm test` | Pending | Must include document/upload tests |
| Backend build | `corepack pnpm build` | Pending | Must pass or record exact failure |
| Contracts validation | `corepack pnpm contracts:check` | Pending | Must validate S05 DTOs/fixtures |
| OpenAPI validation | `corepack pnpm openapi:check` | Pending | Must include S05 document/upload paths |
| Migration check | `corepack pnpm db:migrate:check` | Pending | Must allow S05 document tables and block later-slice tables |
| Seed check | `corepack pnpm db:seed:check` | Pending | Must validate lower-env document seeds |
| API smoke check | document list, upload session, chunk ack, complete upload, signed access | Pending | Use Fastify injection |
| Browser/route check | `/applicant/applications/[id]` document step | Pending | Must inspect applicant document UI |
| Mystery leakage check | serialized document list/read access fixtures | Pending | Must prove no raw Mystery or hidden document metadata leaks |

## Stop triggers

Stop instead of guessing if:

- The implementation needs production storage credentials, real S3 presigning, real scanner integration, or KMS setup.
- File retention/legal wording or production provider behavior must be invented.
- Document visibility cannot be enforced server-side from the Slice 1 actor/scope model.
- The application state machine would require submission, payment, assessment, scoring, allocation, result, certificate, messaging, export, or public map changes.
- Management-plan requirements for Community, Heritage, or Group awards are needed before KBT approval.
- Mystery-safe document projections cannot suppress hidden Mystery metadata.
- Live Figma is known newer than the local snapshot and the user has not approved using the local snapshot.

## Contract review notes

PASS on 2026-05-05.

- Slice 5 is the first eligible TODO after Slice 4, which is DONE_BACKEND with delivery evidence.
- Source PRD, architecture, and NFR references support management plan/document upload, private signed file access, chunked upload, visible progress/retry behavior, and 50MB lower-env file-size acceptance.
- The contract preserves episode-first ownership: documents attach to Full Assessment applicant packages and derive lifecycle context from `assessment_episodes`; `applications` remains applicant package state only.
- Submission/payment, admin queues, judge assessment use of documents, real storage providers, real scanner integration, and production credentials are explicitly deferred.
- Missing exact upload progress/retry/duplicate/scan/version/mobile UI states are recorded as frontend gaps/fallback states.

## Implementation review notes

PASS_WITH_FRONTEND_GAPS on 2026-05-05.

- Contracts, OpenAPI, migration, seed, lint, tests, build/typecheck, API smoke, frontend route smoke, and Mystery leakage checks passed.
- S05 document routes cover list, upload-session creation, chunk acknowledgement, completion, signed access, and version listing.
- Remaining frontend gaps are exact upload progress/retry/failure, duplicate warning, version history/archive, virus-scan pending/rejected, and mobile upload UI variants.

## Closure note

Closed as DONE_BACKEND on 2026-05-05 because backend/API/contracts are verified and the applicant document step exists, while frontend visual coverage remains partial pending additional design evidence.

### Closure Inputs

- Close summary: Management-plan/document metadata, lower-env chunked upload, version/archive, signed access, visibility checks, audit, and applicant document step delivered.
- Client impact: Park managers can see document slots, upload/replace a management plan through lower-env chunked upload contracts, and access current document metadata without enabling submission/payment.
- Frontend handoff: `/applicant/applications/[applicationId]` includes a Documents step and served successfully from the Next app on port 3003; exact upload state visuals remain partial.
- Backend handoff: S05 API routes, shared DTOs/fixtures, OpenAPI paths, document migrations/seeds, scope checks, audit events, duplicate handling, and version/archive metadata are in place.
- Remaining frontend gaps: FE-003, FE-016, FE-017, FE-018, FE-019, FE-020.
- Reopen triggers: New or changed document upload step PNGs, upload state variants, duplicate warning screen, scan state screen, version/archive screen, admin archive screen, or mobile upload exports.
