# Green Flag Award - Agent Guide

Start with concise canonical docs. Long reports under `docs/implementation/working/` are archive/evidence only and are not normal required reading.

## Read order by task

General/backend:
1. `docs/implementation/system_state.md`
2. `docs/implementation/agent-operating-model.md`
3. `docs/implementation/source-reconciliation.md`
4. `docs/implementation/gap-register.md`
5. `docs/implementation/external-configuration-register.md`

Frontend:
1. `docs/implementation/system_state.md`
2. `docs/implementation/frontend-contract-handoff.md`
3. `docs/implementation/gap-register.md`
4. `docs/implementation/ui-slice-map.yaml`
5. Figma manifests/assets
6. `openapi/openapi.json` and `packages/contracts/src/schemas.ts`

DevOps/AWS:
1. `docs/implementation/system_state.md`
2. `docs/implementation/devops-aws-handoff.md`
3. `docs/implementation/external-configuration-register.md`
4. `docs/implementation/production-readiness-checklist.md`
5. `package.json` and `.github/workflows/ci.yml`

QA/UAT:
1. `docs/implementation/system_state.md`
2. `docs/implementation/production-readiness-checklist.md`
3. `docs/implementation/gap-register.md`
4. `docs/implementation/frontend-contract-handoff.md`
5. OpenAPI/contracts

## Current backend status

- Backend is AWS staging/UAT handoff-ready with external gates.
- This is not production launch approval.
- Backend is episode-first and DB-first for production-like runtime.
- `assessment_episodes` is the operational lifecycle root.
- `applications` owns applicant package/draft/submission state only.
- OpenAPI/contracts are the frontend API source of truth.
- Source docs under `docs/source/**` remain authority/reference for product questions.

## Do-not-regress rules

- Preserve DB-first production-like runtime and fail-closed lower-env provider guards.
- Do not reintroduce canonical mutable Map persistence or lifecycle state in `applications.status`.
- Preserve safe DTOs, Mystery redaction, tuple-aware RBAC, scoped read models, audit, and retry/idempotency.
- UI must not override backend Mystery/RBAC/redaction/state-machine rules.
- Do not invent official scoring, applicant bands, fees, VAT/legal wording, provider credentials, certificate wording, or KBT approvals.
- Do not do frontend work unless explicitly tasked.

## Slice workflow

Backend slices are complete. `docs/implementation/slice-backlog.yaml` is historical build sequencing and UI-reopen reference, not normal backend planning.
