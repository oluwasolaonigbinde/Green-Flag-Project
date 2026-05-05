# Slice Contract: S01 Identity, RBAC, and Audit Foundation

## Metadata

- Slice ID: 1
- Title: Identity, RBAC, and audit foundation
- Backlog status: IN_PROGRESS
- Contract state: Frozen
- Contract path: docs/implementation/slice-contracts/S01-identity-rbac-audit-foundation.md
- Source docs used:
  - AGENTS.md
  - docs/implementation/agent-operating-model.md
  - docs/implementation/slice-backlog.yaml
  - docs/implementation/system_state.md
  - docs/implementation/gap-register.md
  - docs/implementation/ui-slice-map.yaml
  - docs/implementation/figma-snapshot-lock.json
  - docs/source/GFA_PRD_v1_1 (1).docx
  - docs/source/GFA_Integrated_Architecture (3).docx
  - docs/source/GFA_Requirements_Spec_v1.1_INTERNAL.xlsx
  - docs/source/GFA_Requirements_Spec_v1.1_CLIENT 2.xlsx
- Related UI evidence:
  - ui-slice-map checked
  - figma manifest checked
  - no slice-specific identity/auth UI surface is mapped in the local evidence

## Objective

Implement the Slice 1 foundation for authenticated identity and access control: Cognito subject mapping, internal user records, scoped role assignments, session/profile resolution, API-side auth guards, and an append-only audit ledger foundation for later data-changing commands.

Slice 1 is legal because it is the first eligible `TODO` slice, it depends only on Slice 0 which is already `DONE_FULL`, no earlier slice is blocked, and there is no active `CONTRACT_REVIEW`, `IN_PROGRESS`, or `REOPENED_FOR_UI` slice.

## Primary user/system path

1. A request reaches the API with a Cognito-backed bearer token.
2. The API verifies the token through the Cognito/JWKS adapter boundary and extracts the stable subject claims.
3. The backend resolves the subject to an internal user and loads that user's scoped role assignments.
4. The route guard compares the actor context against the required role/scope and returns a stable error when access is not allowed.
5. The session/profile endpoint returns a safe actor profile read model for later slices to consume.
6. Any later data-changing command can record an immutable audit event with actor, scope, request metadata, and before/after payloads.

## Scope lock

### In scope

- Cognito subject-to-internal-user identity mapping.
- Internal user persistence and lookup.
- Scoped role assignment persistence using the canonical role/scope types already present in the scaffold.
- Session/profile resolution read model for the authenticated actor.
- API-side auth guard helpers and reusable authorization checks.
- Cognito JWT verification adapter boundary with testable JWKS/config injection.
- Append-only `audit_events` persistence foundation.
- Audit writer/helper functions that accept command-envelope metadata and store immutable events.
- Root contract/package schema updates needed to expose the new auth/session/audit read models.
- Migration convention updates required to add the Slice 1 identity/RBAC/audit tables while still rejecting later-slice domain tables.

### Out of scope

- Organisations, parks, locations, award cycles, and assessment episodes.
- Registration, applications, documents, payments, allocation, visits, scoring, results, notifications, messaging, jobs, exports, and public map features.
- Full Mystery redaction hardening across all surfaces.
- User-facing auth/login UI, profile UI, and admin people-management screens.
- Production Cognito tenant values, secrets, or provider credentials.
- Any invented permission matrix beyond the verified source truth and existing scaffold aliases.

### Forbidden work

- Do not implement later-slice business workflows or entity schemas.
- Do not put application, payment, allocation, or assessment state into `applications`.
- Do not invent provider credentials, MFA secrets, or production JWT/JWKS values.
- Do not expose raw Mystery state through this slice.
- Do not add UI behaviour that bypasses API-side authorization.
- Do not treat audit logging as mutable or updatable.

## Source mapping

### Product / domain truth

- PRD Section 2.2 says permissions are enforced at the API level and cannot be bypassed through the UI.
- PRD Section 3.4 requires audit everything: every data-changing action must be logged immutably.
- PRD Section 9.1 requires authenticated routes to use Cognito JWTs.
- PRD Section 12.3 requires audit log verification and MFA functioning for admin accounts.
- The requirements workbook confirms the role model, MFA requirement for admin accounts, and immutable audit-log expectations.
- The requirements workbook also confirms that the system has a distinct set of user roles and that role profiles/permissions are a first-class concern.
- REQ-SEC-001 requires MFA for all admin accounts.

### Operational / architecture truth

- The architecture doc requires Cognito JWT verification against JWKS with in-memory caching.
- The architecture doc keeps authentication, authorisation, and audit boundaries on the API side.
- `assessment_episodes` remains the lifecycle root for later slices; this slice must not move workflow ownership into `applications`.
- Slice 0 established the actor/scope/error-envelope conventions and the shared schema package that Slice 1 extends.

### Platform reality

- `system_state.md` still marks authentication/RBAC persistence and audit event persistence as not implemented.
- The repo already contains the pnpm workspace scaffold, API scaffold, contracts package, db package, and baseline tests.
- The root migration guard currently blocks later-slice table names, so it must be updated in lockstep with the Slice 1 migration set.
- No active slice exists at the moment.

### Gap register references

- No current gap-register item blocks this slice directly.
- External production Cognito configuration remains a deployment concern, not a repo truth source.
- UI gaps are not blocking because this slice has no slice-specific frontend surface.

## Backend contract

### Data / migration scope

- Add a migration set for:
  - internal users
  - Cognito subject links
  - scoped role assignments
  - append-only audit events
- Keep the schema minimal and typed.
- Preserve the existing `episode-first` boundary by not introducing later domain tables.
- Update `packages/db/scripts/check-migrations.mjs` so it still enforces naming and down markers but allows the approved Slice 1 identity/RBAC/audit tables.
- Keep lower-env seed data synthetic and non-production-looking.

### Commands

- `resolveCognitoIdentity`
- `loadInternalUserProfile`
- `resolveSessionProfile`
- `requireAuthenticatedActor`
- `requireRoleAssignment`
- `appendAuditEvent`
- `mapAuditEventFromCommandEnvelope`

### Queries / read models

- Authenticated session/profile read model.
- Internal user lookup by Cognito subject.
- Role assignment lookup by user and scope.
- Audit ledger append validation and later read support.

### State transitions

- Create and update internal identity links and scoped role assignments.
- Mark audit events as append-only only; no update/delete path.
- No business workflow transitions beyond auth/session resolution.

### RBAC / scope

- Authenticate with a Cognito subject and resolve it to one internal user.
- Support multiple scoped role assignments per user.
- Use the existing role-scope type system from the contracts package.
- Enforce authorization in the API guard layer before route logic runs.
- Require the admin-session path to satisfy the provider-side MFA policy before the guard returns an authenticated admin context.
- Keep the permission decision server-side; UI must not be able to override it.

### Audit

- Create `audit_events` as an immutable append-only ledger.
- Store at minimum: actor/user, role, action, entity, before state, after state, UTC timestamp, and IP.
- Also store request metadata needed for later command tracing, including request ID and idempotency key where present.
- Emit audit helpers and tests that prove the table is insert-only.

### Error cases

- `unauthorized` for missing or invalid JWTs.
- `forbidden` for authenticated actors without the required scope/role.
- `dependency_missing` for verified identities that cannot yet be mapped to an internal user record.
- `validation_failed` for malformed identity, scope, or audit payloads.
- `conflict` for duplicate or incompatible role assignment operations.
- `idempotency_conflict` for repeated command envelopes that reuse the same idempotency key once dedupe support is wired.

### Idempotency / retries

- Preserve the command-envelope shape from Slice 0.
- Persist idempotency metadata alongside audit events so later mutating commands can dedupe safely.
- Do not add a production idempotency store unless the slice contract explicitly needs it.

## API / DTO contract

### Endpoints

- `GET /health` unchanged
- `GET /api/v1/contract-metadata` unchanged
- `GET /api/v1/session` protected endpoint returning the current resolved actor/session profile

### Request DTOs

- No new public write DTOs.
- Authenticated requests use a bearer JWT plus request metadata from the HTTP context.

### Response DTOs

- Session/profile response schema for the authenticated actor.
- Session/profile response should include whether the actor satisfied the provider-side MFA requirement when that information is available from the identity claims.
- Internal user summary schema for the resolved profile.
- Audit event schema for validation and later read paths.
- Existing stable error envelope from Slice 0.

### Mock responses / fixtures

- Synthetic Cognito claims fixture.
- Synthetic internal-user/session fixtures for at least one global admin and one scoped admin.
- Synthetic audit-event fixture with UUID-shaped identifiers and no production-looking values.

## Frontend contract

### Available screens

- No Slice 1-specific UI surface is currently mapped.
- The existing foundation status shell from Slice 0 remains unchanged.

### Partial screens

- None for this slice.

### Missing screens

- Auth/login UI, profile UI, and admin people-management screens remain future work and are not part of this slice.

### Implement now

- No frontend route or component changes are required for Slice 1.

### Stub/mock now

- No frontend stubs are required because there is no Slice 1 user-facing screen.

### Wait for future screens

- Auth/login, profile, and people-management screens wait for later slices and/or new UI evidence.

### Reopen triggers

- New or changed identity/auth/profile Figma evidence.
- Any approved UI surface that depends on this slice's session/profile read model.

## Design coverage check

### Expected UI surfaces for this slice

- None. This is a backend foundation slice.

### PNG matches

- Expected surface: none
  - Matched PNG: none
  - Confidence: high
  - Notes: local Figma evidence contains later applicant/admin surfaces, but no slice-specific identity/auth screen is mapped to Slice 1.

### PNG-backed surface inventory

| Surface | Route | PNG path | Viewport / variant | Visual inventory | Approved fallback | Internal-copy rule |
| --- | --- | --- | --- | --- | --- | --- |
| No Slice 1 UI surface | N/A | N/A | N/A | None | Keep the foundation shell untouched | Do not claim login/profile UI exists |

### Missing or unclear design coverage

- None for this slice.

### Existing implementation overlap

- Slice 0 foundation shell only.
- No Slice 1 production UI is present yet.

### Design traceability

- Surface: none
  - Verified route: N/A
  - PNG: N/A
  - Variant notes: backend-only slice.

### Visual / route-inspection gates

- Route: `/api/v1/session`
  - Screenshot artifact: not required
  - Semantic anchors: authenticated actor profile, resolved scopes, stable error codes on unauthorised access
  - Negative copy assertions: no raw Mystery labels, no production credentials, no later-slice business data

### Ambiguities requiring user decision

- None identified from the source truth.

### User-approved design decisions

- Keep Slice 1 backend-only with no new UI surface.

### Deferred affordance policy

- Element: identity/login/profile UI
  - Treatment: hidden
  - Notes: later slices own the user-facing screens once their UI evidence exists.

## Planned file zones

Advisory only; implementation may choose better locations if repo conventions require it.

- apps/api/src/**
- packages/contracts/src/**
- packages/db/src/**
- packages/db/migrations/**
- packages/db/scripts/check-migrations.mjs
- openapi/**
- docs/implementation/working/**
- docs/implementation/slice-contracts/**
- docs/implementation/delivery-records/**

## Verification matrix

| Check | Command / Artifact | Status | Evidence |
| --- | --- | --- | --- |
| Repo/app scaffold check | inspect root/apps/packages files | Pending | Confirm actual scaffold files exist before coding |
| Workspace install | `corepack pnpm install` if dependency state changes or is uncertain | Pending | Record success or exact blocker |
| Backend lint | `corepack pnpm lint` | Pending | Must pass or record exact failure |
| Backend typecheck | `corepack pnpm typecheck` | Pending | Must pass or record exact failure |
| Backend tests | `corepack pnpm test` | Pending | Must pass or record exact failure |
| Backend build | `corepack pnpm build` | Pending | Must pass or record exact failure |
| Frontend lint | `corepack pnpm lint` | Pending | Root command covers the web workspace even though no UI changes are planned |
| Frontend typecheck | `corepack pnpm typecheck` | Pending | Root command covers the web workspace even though no UI changes are planned |
| Frontend tests | `corepack pnpm test` | Pending | Root command covers the web workspace even though no UI changes are planned |
| Frontend build | `corepack pnpm build` | Pending | Root command covers the web workspace even though no UI changes are planned |
| API/contract validation | `corepack pnpm contracts:check` and `corepack pnpm openapi:check` | Pending | Must validate new auth/session/audit DTOs and OpenAPI paths |
| Migration check | `corepack pnpm db:migrate:check` and `corepack pnpm db:seed:check` | Pending | Must validate naming, down markers, allowed Slice 1 tables, and safe synthetic seeds |
| API smoke check | request `GET /health` and `GET /api/v1/session` with test auth context | Pending | Must prove the new session route and auth guard path work |
| Vertical path check | resolved session/profile read model and one audit insert test | Pending | Must show auth resolution and immutable audit persistence working together |

## Stop triggers

Stop instead of guessing if:

- The role matrix or permission boundaries cannot be derived safely from the requirements workbook and architecture doc.
- The implementation needs production Cognito values, secrets, or tenant credentials that are not available in repo truth.
- A proposed schema would pull application, assessment, payment, or other later-slice workflow state into this slice.
- The audit model would need mutable updates or delete semantics.
- A UI surface turns out to be required but has no mapped evidence yet.
- Migration or contract checks require relaxing slice boundaries beyond the approved Slice 1 identity/RBAC/audit set.

## Contract review notes

PASS on 2026-05-05.

- Slice 1 is the first eligible TODO and depends only on Slice 0, which is DONE_FULL.
- Source truth covers identity mapping, scoped RBAC, MFA for admin accounts, immutable audit logging, and API-side auth enforcement.
- No slice-specific UI surface is mapped, so the slice is correctly backend-only.
- The plan keeps later workflow/state-machine/domain work out of scope and preserves the episode-first boundary.

## Implementation review notes

Pending.

## Closure note

Pending.

### Closure Inputs

- Close summary: Pending
- Client impact: Pending
- Frontend handoff: Pending
- Backend handoff: Pending
- Remaining frontend gaps: Pending
- Reopen triggers: Pending
