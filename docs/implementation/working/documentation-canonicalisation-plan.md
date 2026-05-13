# Documentation Canonicalisation Plan

Date: 2026-05-10

Scope: read-only documentation canonicalisation audit. This plan recommends future documentation updates only. It does not implement those updates and does not edit source code, migrations, tests, OpenAPI/contracts, package files, fixtures, seeds, configs, snapshots, or CI files.

## 1. Executive recommendation

Use `docs/implementation/system_state.md` as the concise canonical current-state doc for normal future agent orientation. It is already the closest fit because it records implemented, partial, not implemented, active slice, commands, and launch posture. Update it into a deliberate "current platform handoff" rather than a slice-close accumulation log.

Recommended canonical model:

- `docs/implementation/system_state.md`: main current-state source of truth for what exists now.
- `docs/implementation/gap-register.md`: frontend gaps, external dependencies, product decisions, and risks that are not backend bugs.
- `docs/implementation/external-configuration-register.md`: production/staging provider, KBT, finance, infrastructure, and runtime setup gates.
- `docs/implementation/production-readiness-checklist.md`: staged release/UAT checklist and launch verdict rule.
- `docs/implementation/frontend-contract-handoff.md`: concise frontend-facing API/DTO/read-model handoff, if created.
- `docs/implementation/devops-aws-handoff.md`: concise AWS staging/runtime handoff, if created.
- `docs/implementation/slice-backlog.yaml`: retain as completed/archival workflow evidence plus UI reopen map, not as the normal backend planning driver.

Pass reports under `docs/implementation/working/` should become archive-only evidence. Future agents should read them only when investigating a specific remediation history, not during normal frontend, DevOps, backend, or QA tasks.

`system_state.md` should contain these exact top-level sections:

- `Current verdict`: backend is ready for AWS staging/UAT handoff with external gates; no production launch approval.
- `Architecture baseline`: episode-first lifecycle, application package state only, DB-first PostgreSQL runtime, backend-owned workflow/RBAC/redaction/audit/API contracts.
- `Implemented backend capabilities`: short grouped bullets by domain, not pass-by-pass narrative.
- `Frontend status`: delivered shells/partial surfaces and link to UI gap register/map.
- `Runtime and verification`: known commands, CI posture, DB/PostGIS/migration apply expectations, remote CI caveat if still unproven.
- `External gates`: pointer summary to external config/readiness docs.
- `Known product decisions`: decisions deferred by product/KBT, explicitly not backend defects.
- `Not implemented`: provider-backed production integrations and official content only.
- `Normal read order`: pointers by agent type.
- `Archive note`: working reports are evidence only.

## 2. Current doc inventory

| Path | Purpose | Current / stale / archive / unknown | Recommended action |
| --- | --- | --- | --- |
| `docs/implementation/system_state.md` | Platform reality and current implementation state. | Mostly current, but overly delivery-log shaped and includes stale operating-layer note. | Update into canonical current-state handoff. |
| `docs/implementation/gap-register.md` | External dependencies, frontend gaps, workflow risks. | Current with minor stale heading/wording. | Update lightly; keep as canonical gap/product-decision register. |
| `docs/implementation/external-configuration-register.md` | Production/staging external setup inputs. | Current. | Update lightly and keep canonical. |
| `docs/implementation/production-readiness-checklist.md` | Release/UAT gates and launch verdict rule. | Current. | Leave with small additions for AWS staging mode caveat and remote CI evidence. |
| `docs/implementation/agent-operating-model.md` | Slice workflow and agent rules. | Stale for normal backend planning because all backend slices are complete. | Update to put handoff/current-state workflow first; retain slice workflow as archival/reopen-only. |
| `docs/implementation/source-reconciliation.md` | Source precedence and allocation reconciliation. | Current as authority rules; allocation section is historical but still useful. | Leave, with optional note that S09 is delivered. |
| `docs/implementation/slice-backlog.yaml` | Executable ordered slice backlog. | Completed backend backlog; stale if treated as next backend planner. | Mark completed/archival; keep UI reopen metadata. |
| `docs/implementation/ui-slice-map.yaml` | Figma/PNG evidence to slices. | Current for frontend gap mapping. | Leave or lightly update to reference frontend handoff. |
| `docs/implementation/working/backend-staging-readiness-final-check.md` | Final backend readiness evidence. | Current but long audit evidence. | Archive-only; summarise into canonical docs. |
| `docs/implementation/working/backend-closure-residual-issues-ledger.md` | Historical residual ledger and Pass B closure update. | Superseded by final check and Pass A/B reports. | Archive-only; not normal reading. |
| `docs/implementation/working/closeout-pass-a-security-dto-rbac-report.md` | Security/DTO/RBAC remediation evidence. | Current evidence for that pass. | Archive-only; summarise outcomes in `system_state.md`. |
| `docs/implementation/working/closeout-pass-b-retry-runtime-ci-report.md` | Retry/runtime/CI remediation evidence. | Current evidence for that pass. | Archive-only; summarise outcomes in `system_state.md`, readiness checklist, DevOps handoff. |
| `docs/implementation/working/pass-*`, `backend-architecture-quality-audit.md`, `legacy-business-capability-migration-audit.md` | Historical audits/checkpoints. | Superseded for normal orientation. | Archive-only. |
| `docs/implementation/working/current-plan.md`, `current-plan-review.md`, `current-implementation-review.md` | Active slice working files. | Stale now that active slice is none. | Archive/clear through a documentation-only follow-up; do not use as current state. |
| `docs/implementation/commands/*.md` | Slice command workflow. | Useful for reopen/frontend slices, stale as default backend workflow. | Keep but mark slice-era/reopen-only in operating model. |
| `docs/source/**` | Original PRD, requirements, architecture, playbook, legacy schema notes. | Source authority/reference, not current implementation state. | Leave unchanged. |
| `README.md` | Root repository overview and commands. | Stale; says only Slice 0/1 exist and later workflows are not implemented. | Update later to point to canonical handoff docs. |
| `packages/db/migrations/README.md` | Migration convention. | Stale; says later domain tables belong to later backlog slices. | Update later with current migration scope and convention only. |
| `package.json` | Command registry. | Current command source. | Leave. |
| `.github/workflows/ci.yml` | CI workflow with PostgreSQL/PostGIS checks. | Current locally; remote run evidence still external. | Leave. |
| `openapi/openapi.json` | API contract artifact. | Current contract artifact, but `info.description` is stale/foundation-oriented. | Do not edit in this audit; consider contract-owned update later. |
| `packages/contracts/src/schemas.ts` | Shared DTO schemas. | Current contract source; internal DTOs still include storage fields by design. | Leave. |

## 3. Canonical docs to update

### `docs/implementation/system_state.md`

New purpose: the normal first-read current-state handoff for all agents.

Sections to update:

- Add `Current verdict`.
- Replace pass-by-pass implemented bullets with grouped domains: identity/RBAC/audit, episode model, applicant package, documents, payment/manual invoice shell, admin queues, assessor/allocation, Mystery redaction, assessment/scoring framework, decisions/results/certificates/public-map events, notifications/messages/jobs/exports/reminders, PostgreSQL runtime/read models, hardening/CI.
- Add `Architecture baseline`.
- Add `Frontend status`.
- Add `Runtime and verification`.
- Add `External gates`.
- Add `Product decisions not backend bugs`.
- Add `Archive note`.
- Remove or replace stale note that the operating layer has not been validated by a repo-aware agent.

Key messages to include:

- Backend is DB-first PostgreSQL for implemented production-like command paths.
- `assessment_episodes` remains the lifecycle root; `applications` remains applicant package state only.
- Mystery secrecy, RBAC, audit, state machines, and redaction are backend responsibilities.
- Applicant/public DTO hardening has closed public storage-key/message-metadata exposure for applicant document/message/result surfaces; admin/internal DTOs remain operational and route-protected.
- Backend status is AWS staging/UAT handoff ready with external gates, not production launch approved.
- Provider-backed storage/scanning/email/SMS/payment/Business Central/public-map/certificate generation remain external or disabled.

What not to include:

- Long pass evidence, line-by-line file references, command transcripts, or historical remediation narrative.
- Official scoring text, bands, fees, VAT/legal wording, provider payloads, credentials, or KBT approvals.
- A legacy-schema rewrite recommendation or movement of lifecycle state into `applications`.

### `docs/implementation/gap-register.md`

New purpose: canonical gaps, external dependencies, frontend gaps, workflow/product risks.

Sections to update:

- Keep `External production dependencies`.
- Keep `Frontend/design gaps`.
- Rename `Persistence hardening TODO` to `Persistence/performance follow-up` or merge into `Workflow risks`.
- Add `Product decisions not backend bugs`.
- Add `Archive pointers` only if needed, linking final readiness report for evidence.

Key messages to include:

- Official scoring criteria/subcriteria/guidance, applicant bands, fees, VAT/legal invoice wording, provider credentials, Business Central contract, S3/scanning, SES/SMS, public map adapter, certificate wording/generator, KBT UAT/signoff, and AWS staging/prod infrastructure are external gates.
- Result republish/revision/history, full provider automation timing, real renewal reminder target model, Community/Heritage/Group activation, and migration/import scope are product/governance decisions.

What not to include:

- Implementation proof from every pass report.
- New backend bugs for decisions that require product/KBT contracts.

### `docs/implementation/external-configuration-register.md`

New purpose: canonical staging/production setup register.

Sections to update:

- Add `AWS staging/UAT runtime posture`.
- Add explicit `Provider-backed actions disabled unless configured` row.
- Add remote CI evidence as a deployment handoff item if still not captured.
- Keep existing runtime, location, documents, finance, assessor/allocation, assessment/results, communications/jobs/export sections.

Key messages to include:

- `API_RUNTIME_MODE=staging` currently fails closed with lower-env providers unless approved staging-safe adapters/configuration are supplied.
- Manual/offline payment and invoice modes are deliberate MVP gates, not production finance completion.
- No real credentials or legal/business values belong in docs.

What not to include:

- Secrets, provider payload examples, production fees, legal wording, or staging account details.

### `docs/implementation/production-readiness-checklist.md`

New purpose: canonical go/no-go checklist for staging, UAT, and production launch.

Sections to update:

- Keep status, automated gates, UAT, migration, performance, security/privacy, provider/manual configuration, monitoring, launch verdict.
- Add a staging-specific note: code may be handed to AWS staging/UAT with provider-backed actions disabled or configured safely; this is not production launch approval.
- Add remote GitHub Actions evidence capture to automated gates.

Key messages to include:

- Production launch verdict requires external/manual configuration, representative UAT acceptance, migration rehearsal, monitoring/rollback, security/privacy signoff, and provider smoke tests.

What not to include:

- A claim that production is approved because local checks passed.

### `docs/implementation/agent-operating-model.md`

New purpose: agent operating model for post-backend-completion handoff plus archived slice workflow.

Sections to update:

- Add `Post-backend-completion operating mode`.
- Move slice statuses/lifecycle below a heading such as `Archived/completed slice workflow`.
- Clarify that the backlog no longer selects normal backend work while all backend slices are closed.
- Clarify when `resume-from-new-screens` and UI-only reopening still apply.
- Add future agent read orders or point to `system_state.md`.

Key messages to include:

- Normal agents should start with `system_state.md`, not long working reports.
- Backend/API changes after completion require explicit contract/product scope, not ad-hoc continuation of the old backlog.
- Frontend reopen work may still use `ui-slice-map.yaml` and completed slice contracts for context.

What not to include:

- Instructions that future backend agents must select the next TODO when there is no backend TODO left.

### `docs/implementation/source-reconciliation.md`

New purpose: source authority and conflict resolution.

Sections to update:

- Leave mostly unchanged.
- Optionally add a short `Current status note` that S09 allocation is delivered and remaining allocation variants are configuration/import/UAT inputs.

Key messages to include:

- Product/requirements docs remain authority for business rules.
- UI shapes layout/read models only.

What not to include:

- Current implementation status beyond small notes; that belongs in `system_state.md`.

### `docs/implementation/ui-slice-map.yaml`

New purpose: Figma/PNG evidence map for frontend and QA.

Sections to update:

- Leave data mostly unchanged.
- Add a short top comment that the backend slice backlog is complete and this file now supports frontend gap closure, visual QA, and UI reopen planning.

Key messages to include:

- Missing public map/profile and mobile/offline PNG evidence remain frontend/design gaps.
- UI must not override backend rules, especially Mystery redaction/contact visibility.

What not to include:

- Backend implementation state or provider launch gates.

## 4. New docs to create, if any

### `docs/implementation/frontend-contract-handoff.md`

Audience: frontend agents and UI QA agents.

Reason: existing docs split frontend-relevant knowledge across `system_state.md`, `gap-register.md`, `ui-slice-map.yaml`, OpenAPI/contracts, and long delivery reports. A concise handoff would prevent frontend agents from reading backend closeout reports.

Outline:

- Current frontend posture.
- Canonical API/contract sources: `openapi/openapi.json`, `packages/contracts/src/schemas.ts`, fixtures/tests.
- Safe applicant/public projections and forbidden fields.
- Mystery redaction rules for UI.
- Screen evidence map and unresolved UI gaps.
- Per-surface handoff: applicant, admin, assessor, public.
- Do-not-invent list: fees, bands, scoring wording, certificate wording, provider flows.

Source docs/reports to summarise:

- `system_state.md`
- `gap-register.md`
- `ui-slice-map.yaml`
- `source-reconciliation.md`
- `closeout-pass-a-security-dto-rbac-report.md`
- `backend-staging-readiness-final-check.md`

### `docs/implementation/devops-aws-handoff.md`

Audience: DevOps/AWS/staging deployment agents.

Reason: DevOps-critical details are currently embedded in the final readiness report and production checklist. A concise handoff avoids relying on a long working report.

Outline:

- Handoff verdict: AWS staging/UAT ready with external gates, not production launch approved.
- Required commands and CI expectations.
- Runtime env vars and modes.
- PostgreSQL/PostGIS and migration apply expectations.
- Production-like fail-closed guards.
- Provider-backed actions disabled/configured safely.
- External config matrix and owner inputs.
- Deployment evidence to capture.

Source docs/reports to summarise:

- `backend-staging-readiness-final-check.md`
- `closeout-pass-b-retry-runtime-ci-report.md`
- `external-configuration-register.md`
- `production-readiness-checklist.md`
- `package.json`
- `.github/workflows/ci.yml`

### `docs/implementation/external-launch-gates.md`

Audience: product, QA/UAT, DevOps, and governance agents.

Reason: optional. Existing `gap-register.md`, `external-configuration-register.md`, and `production-readiness-checklist.md` already cover this. Create only if stakeholders want a single business-facing gate sheet.

Outline:

- Product/KBT gates.
- Provider/infrastructure gates.
- Finance/legal gates.
- Migration/import gates.
- UAT/signoff gates.
- Decisions not backend bugs.

Source docs/reports to summarise:

- `gap-register.md`
- `external-configuration-register.md`
- `production-readiness-checklist.md`
- `backend-staging-readiness-final-check.md`

### Root `AGENTS.md` or updated `docs/implementation/agent-operating-model.md`

Audience: all future agents.

Reason: a root `AGENTS.md` would make the current read order unavoidable from repo root. If adding another root file is undesirable, update `agent-operating-model.md` and root `README.md` instead.

Outline:

- Read first: `system_state.md`, `gap-register.md`, external config/readiness docs, source reconciliation.
- Working reports are archive-only.
- Source docs remain authority.
- Episode-first non-negotiables.
- No production launch approval claim.

Source docs/reports to summarise:

- Current user-supplied AGENTS instructions.
- `agent-operating-model.md`
- `system_state.md`

## 5. Docs to mark archival/completed

Mark these as archive-only evidence, either by a short banner at the top of each file or by moving/collecting them under an archive index. Do not delete unless a later cleanup task explicitly approves it.

Slice/backlog/workflow docs:

- `docs/implementation/slice-backlog.yaml`: mark completed/archival; retain statuses and `frontend_reopen_allowed`.
- `docs/implementation/slice-contracts/S00-*` through `S14-*`: completed contract evidence.
- `docs/implementation/delivery-records/S00-*` through `S14-*`: completed delivery evidence.
- `docs/implementation/commands/plan-next-slice.md`, `build-current-slice.md`, `review-current-contract.md`, `review-current-slice.md`, `close-current-slice.md`: slice-era commands; keep for reopen or future explicit slice work, not normal orientation.
- `docs/implementation/working/current-plan.md`, `current-plan-review.md`, `current-implementation-review.md`: stale working files; archive/clear through a later documentation task.

Long working reports:

- `docs/implementation/working/backend-staging-readiness-final-check.md`
- `docs/implementation/working/backend-closure-residual-issues-ledger.md`
- `docs/implementation/working/closeout-pass-a-security-dto-rbac-report.md`
- `docs/implementation/working/closeout-pass-b-retry-runtime-ci-report.md`
- `docs/implementation/working/backend-architecture-quality-audit.md`
- `docs/implementation/working/legacy-business-capability-migration-audit.md`
- `docs/implementation/working/pass-1-runtime-persistence-checkpoint.md`
- `docs/implementation/working/pass-1b-db-first-confirmation.md`
- `docs/implementation/working/pass-2a-allocation-assessor-confirmation.md`
- `docs/implementation/working/pass-2b-assessment-confirmation.md`
- `docs/implementation/working/pass-2b-assessment-db-first-report.md`
- `docs/implementation/working/pass-2c-audit-fix-report.md`
- `docs/implementation/working/pass-2c-communications-confirmation.md`
- `docs/implementation/working/pass-2c-communications-db-first-report.md`
- `docs/implementation/working/pass-2d-results-confirmation.md`
- `docs/implementation/working/pass-2d-results-db-first-report.md`
- `docs/implementation/working/foundation-goal.md`
- `docs/implementation/working/continue-goal.md`

Stale docs to update rather than archive:

- `README.md`: currently implies only Slice 0/1 and no later workflows.
- `packages/db/migrations/README.md`: currently implies later domain tables are still future backlog work.
- `openapi/openapi.json` `info.description`: stale/foundation-oriented, but only update through normal contract/OpenAPI workflow.

## 6. Future agent read order

Frontend agents:

1. `docs/implementation/system_state.md`
2. `docs/implementation/frontend-contract-handoff.md`, once created
3. `docs/implementation/gap-register.md`
4. `docs/implementation/ui-slice-map.yaml`
5. `docs/figma-manifest.md`, `docs/figma-manifest.json`, and relevant `docs/figma/**`
6. `openapi/openapi.json`
7. `packages/contracts/src/schemas.ts`
8. Relevant source docs under `docs/source/**` only for product authority questions

DevOps/AWS agents:

1. `docs/implementation/system_state.md`
2. `docs/implementation/devops-aws-handoff.md`, once created
3. `docs/implementation/external-configuration-register.md`
4. `docs/implementation/production-readiness-checklist.md`
5. `package.json`
6. `.github/workflows/ci.yml`
7. `docs/implementation/gap-register.md`
8. `docs/implementation/working/backend-staging-readiness-final-check.md` only for audit evidence

Backend agents:

1. `docs/implementation/system_state.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/source-reconciliation.md`
4. `docs/implementation/gap-register.md`
5. `docs/implementation/external-configuration-register.md`
6. `openapi/openapi.json`
7. `packages/contracts/src/schemas.ts`
8. Relevant source docs under `docs/source/**`
9. Working reports only when investigating a specific historical remediation

QA/UAT agents:

1. `docs/implementation/system_state.md`
2. `docs/implementation/production-readiness-checklist.md`
3. `docs/implementation/gap-register.md`
4. `docs/implementation/external-configuration-register.md`
5. `docs/implementation/frontend-contract-handoff.md`, once created
6. `docs/implementation/ui-slice-map.yaml`
7. `openapi/openapi.json`
8. Relevant source docs under `docs/source/**`

## 7. Proposed documentation update sequence

1. Update `system_state.md` into the canonical current-state handoff using the section model above.
2. Update `gap-register.md`, `external-configuration-register.md`, and `production-readiness-checklist.md` only enough to remove ambiguity and add product-decision/external-gate framing.
3. Update `agent-operating-model.md` so normal future work starts from current-state handoff, while slice commands become archival/reopen-only.
4. Mark `slice-backlog.yaml`, slice contracts, delivery records, command docs, and working reports as completed/archive-only without deleting them.
5. Create `frontend-contract-handoff.md` and `devops-aws-handoff.md`.
6. Update root `README.md` and `packages/db/migrations/README.md` so they no longer describe the repo as an early Slice 0/1 scaffold.
7. Consider OpenAPI `info.description` cleanup only through the contract/OpenAPI workflow, not as an ad-hoc documentation edit.

## 8. Mutation check

Initial `git status --short` before writing this report showed an already dirty workspace with modified backend source/tests/contracts/docs/package files and many untracked pass artifacts, migration files, `.github/`, and `output/`. Notable pre-existing modified paths included `docs/implementation/system_state.md`, `docs/implementation/gap-register.md`, `docs/implementation/slice-backlog.yaml`, `openapi/openapi.json`, `package.json`, and `packages/contracts/src/schemas.ts`.

Final `git status --short` after writing this report showed the same pre-existing dirty workspace plus:

- `?? docs/implementation/working/documentation-canonicalisation-plan.md`

Mutation confirmation: the only new or modified path from this audit was `docs/implementation/working/documentation-canonicalisation-plan.md`. No source code, migrations, tests, OpenAPI/contracts, package files, lock files, generated clients, fixtures, seed files, configs, snapshots, CI files, or other documentation files were edited by this audit.
