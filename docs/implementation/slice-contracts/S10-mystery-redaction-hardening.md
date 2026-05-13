# Current Plan

## Metadata

- Slice ID: 10
- Title: Mystery Shop redaction hardening
- Backlog status: CONTRACT_REVIEW
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S10-mystery-redaction-hardening.md
- Planned on: 2026-05-06
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/source-reconciliation.md
  - docs/implementation/ui-slice-map.yaml
  - docs/source/README.md
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - Existing contracts and delivery records S04-S09

## Slice Selection

S10 is the first eligible `TODO` slice. Dependencies S02, S04, S07, and S09 are closed. There was no active `CONTRACT_REVIEW`, `IN_PROGRESS`, or `REOPENED_FOR_UI` slice before planning.

## Objective

Centralize server-side Mystery Shop redaction for all delivered applicant/org-facing surfaces and establish reusable policy boundaries for notifications, messages, exports, search/counts, documents, status labels, and future S11/S12 read models. Admin/super-admin visibility must remain intact where the actor has an authorized admin redaction profile.

## Primary Paths

1. Applicant/org reads dashboard/application/document surfaces for a park that has a Mystery episode.
2. Backend redaction policy suppresses raw Mystery metadata and returns only safe labels such as `APPLICATION_UNDER_REVIEW`.
3. Admin reads operational queues/details and retains authorized visibility without applicant/org leak constraints.
4. Future notification/message/export/search projectors call the same policy and get explicit redaction decisions or blocked errors.

## Source Mapping

- `REQ-CYC-002`: applicant-facing Mystery visibility remains `APPLICATION_UNDER_REVIEW`; assessor, visit, assignment, judge count, and assessment type are suppressed.
- `source-reconciliation.md`: Mystery applicant visibility suppresses assessor, visit, assignment, judge count, and assessment type.
- Architecture redaction rules: backend owns secrecy across APIs, read models, notifications, documents, messages, exports, search, and status labels.
- S04/S05/S06/S07/S08/S09 delivery records: each has local Mystery leak checks, but S10 must consolidate into a central policy.
- UI evidence may shape redacted applicant/detail layout only; it does not define hidden fields.

## Backend Scope

- Replace ad hoc redaction branching with a central policy module in `apps/api/src/redaction.ts`.
- Define explicit redaction surfaces for delivered/current surfaces:
  - applicant dashboard
  - applicant document list
  - signed document access
  - applicant/org notification intent projection
  - applicant/org message metadata projection
  - applicant/org search/count/export metadata projection
  - status label projection
- Redact/suppress for applicant/org actors:
  - raw `MYSTERY_SHOP`
  - episode type
  - raw episode status where it implies Mystery operations
  - assignment/allocation state
  - judge identity and judge count
  - visit dates/times and assessment timestamps
  - suppressed notification detail
  - hidden document metadata, filenames, content type, storage keys
  - raw scores and result internals
  - search/export/count metadata that would prove hidden Mystery activity
- Keep admin/super-admin visibility intact for `SUPER_ADMIN` and `KBT_ADMIN` through authorized redaction profiles.
- Emit predictable `redaction_blocked` errors where a caller requests an unsafe applicant/org projection that cannot be safely transformed.
- Preserve `assessment_episodes` as lifecycle root; do not move Mystery state into `applications`.

## API / DTO Scope

- Add contract DTOs for redaction policy surface names, redaction decisions, and synthetic redaction matrix fixtures.
- No new public API route is required unless tests need an existing route to verify behavior.
- Existing API responses must remain backward compatible except where unsafe fields are removed/redacted for applicant/org actors.
- OpenAPI can remain unchanged unless new DTOs are surfaced by an endpoint.

## Frontend Scope

- No full frontend implementation is required.
- Existing applicant dashboard/document pages must continue to render safe fixture states.
- No new messaging/export/search UI should be invented in this slice.

## UI Evidence

Available:
- `docs/figma/Applicant - Application - Application details - Mystery Shopping.png`
- `docs/figma/Applicant - Messages.png`
- `docs/figma/Applicant - Compose message.png`
- `docs/figma/Applicant - Dasboard - site visit - list view.png`
- `docs/figma/Applicant - Dashboard- site visit - calender view.png`
- Super Admin queues/document/archive screens in `docs/figma/`

Partial:
- Mystery-specific allocation, visit, notification, export, and count variants are not fully represented.

Missing:
- Applicant/org search/export count variants.
- Suppressed notification log UI.
- Exact Mystery message/thread redaction states.
- Mobile Mystery redaction variants.

## Mock / Stub Plan

- For surfaces not yet implemented as APIs, add typed policy/projector helpers and matrix tests instead of UI/routes.
- Use synthetic lower-env fixtures only.
- Do not invent production notification text, message templates, export formats, scoring labels, or visit workflows.

## Frontend Gap Records Required

- Existing FE-007/FE-008/FE-010/FE-034 remain sufficient.
- No new frontend gap is required unless implementation discovers a current route with unsafe or unsupported UI evidence.

## External Blockers

None for S10. Production notification providers, SMS, scoring criteria, and export formats remain later dependencies, but redaction policy can be implemented against typed boundaries now.

## Forbidden Work

- Do not implement visits/scoring/result decisions/publication.
- Do not implement notification sending, messaging storage, export jobs, or public map updates.
- Do not expose raw Mystery metadata to applicant/org actors.
- Do not hardcode production copy, scoring criteria, result bands, notification templates, provider credentials, or export schemas.
- Do not use UI labels to define secrecy rules.

## Planned File Zones

- `packages/contracts/src/enums.ts`
- `packages/contracts/src/schemas.ts`
- `packages/contracts/src/fixtures.ts`
- `packages/contracts/src/contracts.test.ts`
- `apps/api/src/redaction.ts`
- `apps/api/src/*test.ts`
- `docs/implementation/slice-contracts/S10-mystery-redaction-hardening.md`
- `docs/implementation/delivery-records/S10-mystery-redaction-hardening-delivery.md`
- `docs/implementation/system_state.md`
- `docs/implementation/gap-register.md`
- `docs/implementation/working/current-implementation-review.md`
- `docs/implementation/slice-backlog.yaml`

## Verification Matrix

| Check | Command / Area | Required |
| --- | --- | --- |
| Install | `corepack pnpm install --frozen-lockfile` | Required |
| Contracts | `corepack pnpm contracts:check` | Required |
| OpenAPI | `corepack pnpm openapi:check` | Required |
| Migrations | `corepack pnpm db:migrate:check` | Required |
| Seeds | `corepack pnpm db:seed:check` | Required |
| Lint | `corepack pnpm lint` | Required |
| Tests | `corepack pnpm test` | Required |
| Build | `corepack pnpm build` | Required |
| Typecheck | `corepack pnpm typecheck` | Required |
| DB integration | `corepack pnpm db:integration:test` | Required if DB changes occur; otherwise optional smoke |
| Targeted redaction | applicant/org/admin matrix tests | Required |

## Stop Triggers

- A source requirement demands raw Mystery details on applicant/org-facing surfaces.
- Safe projection cannot preserve existing public API compatibility without a contract change.
- A surface needs visits/scoring/results/notifications/jobs/messages/exports implementation rather than redaction boundaries.
- Redaction cannot be centralized without broad unrelated rewrites.

## Closure

- Closed on: 2026-05-06
- Status: DONE_FULL
- Delivery record: `docs/implementation/delivery-records/S10-mystery-redaction-hardening-delivery.md`

Delivered central policy and matrix tests for delivered applicant/org redaction surfaces plus notification/message/search/export/status projector boundaries. Later slices still own actual visits, scoring, decisions, notification sending, messaging persistence, exports, and public map behavior.
