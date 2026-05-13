# Frontend Contract Handoff

This is the frontend source of truth for the current backend handoff. Use it with `openapi/openapi.json` and `packages/contracts/src/schemas.ts`.

## Current posture

- Backend APIs are AWS staging/UAT handoff-ready with external gates.
- Frontend implementation is partial and should use contracts, safe DTOs, and explicit gap records rather than historical working reports.
- Do not infer product scope, Mystery metadata, official values, or provider behavior from UI assets.

## Contract sources

- OpenAPI: `openapi/openapi.json`
- Shared schemas: `packages/contracts/src/schemas.ts`
- Frontend/design gaps: `docs/implementation/gap-register.md`
- Visual evidence: `docs/implementation/ui-slice-map.yaml`, `docs/figma-manifest.md`, `docs/figma-manifest.json`, and `docs/figma/**`

## Safe applicant/public projections

- Applicant document DTOs no longer expose `storageProvider` or `storageKey`.
- Applicant document access must use the signed access/download action; do not assume direct object-key downloads.
- Applicant messages no longer expose `participantActorIds`, `senderActorId`, or `visibleToApplicant`.
- Applicant results are safe and omit raw scores, internal notes, artifacts/storage internals, evidence, judge/visit/assignment data, and Mystery metadata.
- Public/applicant UI must not display internal actor IDs, storage keys, raw/internal scoring fields, suppressed rows, or Mystery indicators.
- Admin/internal/judge DTOs may contain operational fields behind protected routes; do not reuse them for applicant/public surfaces.

## Mystery rules for UI

- Mystery secrecy is enforced server-side, but UI must not weaken it with labels, hints, derived states, hidden metadata, or local assumptions.
- Applicant/org surfaces must not reveal Mystery status, visit timing, assessor identity, contact reveal state, judge count, suppressed messages/documents, or internal result details.
- Contact reveal rules come from backend contracts. UI labels do not define visibility.
- If a design implies a Mystery leak, record a frontend/design gap and follow backend/source rules.

## Key journeys

Applicant:
- Registration and verification.
- Dashboard/application list.
- Application draft/autosave and previous feedback response.
- Management plan/document upload, version/archive summary, and signed access.
- Submission, PO/no-PO, manual/offline payment status, messages, result viewing, and renewal reminders.

Admin:
- Registration/application/payment/document/result queues.
- Application detail and allocation readiness.
- Allocation candidate workflow, hold/release/reassign, overrides, and contact reveal visibility.
- Assessment review, result hold/publish/withdraw, exports, jobs, and audit-related operational views.

Assessor:
- Profile/accreditation markers, preferences, availability, capacity.
- Allocation accept/decline.
- Visit scheduling, assessment scoring/evidence, offline sync, and submission.

Public:
- Public award/map/profile surfaces remain design/contract gaps except for provider-neutral backend public map events.

## Unresolved frontend/design gaps

Use `docs/implementation/gap-register.md` for active frontend gaps and `docs/implementation/ui-slice-map.yaml` for screen evidence and reopen triggers.

High-signal gaps:
- Applicant autosave/conflict/loading, document retry/duplicate/scan/version/mobile, payment state variants, and online card flow.
- Goal 2 finance now stores richer invoice facts internally, but applicant/admin DTOs still intentionally use the old safe `amount_marker` shape because no contracts changed. Before UAT/go-live, run a deliberate contract/frontend pass for invoice totals, invoice download/display, and admin finance queues once KBT Finance approves production values.
- Admin queue/status/payment/document/archive/mobile variants.
- Allocation candidate review/map/hold-release/reassignment/contact-reveal UI variants.
- Assessor mobile/offline assessment PNG exports.
- Certificate/public map/public park profile visitor surfaces.

## Do not invent

- Official scoring text, criteria, thresholds, applicant bands, certificate wording, fees, VAT/legal text, provider credentials, provider payloads, or KBT approvals.
- Frontend-only workflow rules for lifecycle state, RBAC, Mystery redaction, audit, or provider behavior.
