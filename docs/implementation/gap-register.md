# Green Flag Award - Gap Register

This is the canonical register of active gaps, external dependencies, frontend/design gaps, and product decisions. Fixed backend hardening issues are not listed as open gaps.

## External gates

| Gap ID | Area | Dependency | Current handling | Required before |
| --- | --- | --- | --- | --- |
| EXT-001 | Scoring | Official Standard Green Flag criteria, subcriteria, guidance text, and threshold guidance | Configurable lower-env framework only | Scoring UAT and production assessment |
| EXT-002 | Results | Applicant band labels/ranges and publication wording | Safe applicant result projection without raw/internal fields or public bands | Applicant-facing result publication |
| EXT-003 | Finance | Production fees, VAT treatment, due dates, invoice/legal wording | Manual/offline MVP markers and no invented values | Production invoice generation |
| EXT-004 | Finance | Business Central data contract, credentials, and reconciliation process | Manual/export boundary only | Automated finance integration |
| EXT-005 | Payments | Payment provider account, keys, webhook signatures, replay rules, and card-flow signoff | Manual mark-paid MVP; provider automation disabled | Online card automation |
| EXT-006 | Awards | Community, Heritage, and Group criteria/processes | Draft/blocked categories | Activation beyond Standard Green Flag |
| EXT-007 | Communications | Email/SMS providers, sender identities, approved copy, opt-out/bounce policy | Queue/log/suppression records; dispatch provider not configured | Production dispatch |
| EXT-008 | Documents | Storage provider, signed URL adapter, virus scanning, retention/quarantine policy | Lower-env shell and audited signed-access command | Production document handling |
| EXT-009 | Public map | Final endpoint/data contract, credentials, retry policy, reconciliation | Provider-neutral public map event outbox | Automated public map sync |
| EXT-010 | Migration | Current-system export files, ownership mapping, import rules | Synthetic seeds and migration conventions only | Migration dry run/go-live load |
| EXT-011 | Governance | Legal, compliance, accessibility, security/privacy, KBT UAT, and formal signoff | Hooks and checklists only | Launch approval |
| EXT-012 | DevOps/AWS | AWS staging/prod infrastructure, secrets, monitoring, backup/rollback, remote CI evidence | Local checks and CI workflow exist; no deployment evidence captured here | Staging/UAT deployment and go-live |
| EXT-013 | Allocation | Production policy overrides, live COI source/import, distance/cluster enrichment, training third-judge approvals | Configurable foundation and audit-backed overrides | Allocation UAT/signoff |

## Frontend/design gaps

| Gap ID | Surface | Current evidence | Current handling |
| --- | --- | --- | --- |
| FE-001 | Applicant dashboard/application list/detail | Applicant PNG families available; exact state variants partial | Use API contracts and available screens; record missing variants |
| FE-002 | Application wizard/autosave/previous feedback/mobile | Main wizard PNGs available; conflict, loading, previous-feedback, and mobile variants incomplete | Contract-backed route shell and explicit gaps |
| FE-003 | Documents/upload/versioning/scan/mobile | Document step PNG available; retry, duplicate, scan, archive, and mobile variants missing | Contract-backed upload/version states |
| FE-004 | Submission/payment/PO/invoice/manual payment/card/mobile | Submitted/payment PNGs available; state-specific and provider screens missing | Manual/offline MVP; no provider assumptions |
| FE-005 | Admin dashboards/queues/documents/payments/results/mobile | Super Admin dashboard/queue/document PNGs available; variants partial | Contract-backed read models and responsive shells |
| FE-006 | Assessor/admin management | Assessor/admin PNGs available; create/edit/disable/accreditation/conflict/mobile states partial | Contract-backed assessor profile/capacity routes |
| FE-007 | Allocation candidate/release/reassignment/contact reveal | Allocation list and schedule evidence available; detail variants missing | Backend contracts delivered; UI must obey server visibility |
| FE-008 | Judge assessment/mobile/offline | Desktop assessment/scoring PNGs available; mobile PNG exports missing | Use desktop evidence; keep mobile/offline visual gap |
| FE-009 | Results/certificates/publication | Result/admin/map-related PNGs available; certificate/public visitor UI not confirmed | Safe DTOs and artifact shells only |
| FE-010 | Public winner map/profile | No public visitor PNGs exported | Pending public design/contract |
| FE-011 | Registration verification/admin registration queue | Source requires surfaces; exact PNGs partial/missing | Functional fallbacks and queue contracts |
| FE-012 | Messaging/site visit UI | Applicant message/site visit PNGs available | UI must not infer Mystery visit/contact visibility |

Use `docs/implementation/ui-slice-map.yaml` for detailed Figma/PNG mapping and reopen triggers.

## Product decisions not backend bugs

- Result correction, republish, reissue, revision, archive, and history semantics.
- Renewal reminder target-level dedupe once the real target/expiry/offset recipient model is approved.
- Provider-backed automation timing for storage/scanning, communications, payment, Business Central, public map dispatch, exports, and certificate generation.
- Current-system migration/import scope and reconciliation ownership.
- Official copy, labels, legal wording, templates, certificate wording, and applicant-facing result language.

## Persistence/performance follow-up

- Map-backed PostgreSQL runtime is closed for implemented production-like command paths.
- Runtime payload compatibility is removed from the active adapter path; rollback SQL may still mention old columns.
- Further persistence work is load-driven: use UAT volume, query plans, export/reporting needs, and monitoring before adding projections or indexes.

## Archive note

Closeout reports under `docs/implementation/working/` are evidence only. They are not normal read-first documents for future agents.
