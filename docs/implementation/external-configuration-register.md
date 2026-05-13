# External Configuration Register

This is the canonical register for staging and production configuration that must come from deployment, providers, KBT, finance/legal, or UAT owners. Do not store secrets or invented business values in docs.

## AWS staging/UAT runtime posture

| Area | Required setup | Current handling |
| --- | --- | --- |
| Backend verdict | Deployable to AWS staging/UAT with external gates | Backend code is ready for handoff; this is not production launch approval. |
| Runtime mode | Choose approved lower-env/manual UAT mode or supply staging-safe provider config | `API_RUNTIME_MODE=staging` is production-like and fails closed with lower-env providers. |
| Database | PostgreSQL/PostGIS `DATABASE_URL`, migrations, backup/restore, monitoring | DB-first repositories and migration checks exist. |
| Cognito/auth | Issuer, audience/client IDs, JWKS URL, MFA/session policy, user/role import | DB-backed users/role assignments exist; real values are deployment config. |
| Remote CI evidence | GitHub Actions run URL/result on the deployment branch | Workflow exists; remote run evidence must be captured before deployment. |

## Provider-backed actions

| Area | Required setup | Current handling |
| --- | --- | --- |
| Provider-backed actions | Approved staging-safe disabled adapters or real provider adapters/config | Disabled/fail-closed until supplied. |
| Storage/signed URLs | Provider, bucket/container, IAM, retention, signed URL adapter | Lower-env shell plus audited signed-access command only. |
| Virus scanning | Scanner provider, callbacks, quarantine/reject policy | Metadata/status model only. |
| Email/SMS | Provider accounts, sender identities, credentials, templates, suppression/opt-out policy | Queue/log/suppression records only; no real dispatch. |
| Exports | Approved formats, recipients, retention, delivery provider | Generic export job/artifact shell only. |
| Public map | Endpoint/data contract, credentials, retry/reconciliation policy | Provider-neutral event outbox only. |
| Certificate generation | Generator/provider, wording, verification policy, reissue rules | Certificate shell artifact metadata only. |

## Finance and payments

| Area | Required setup | Current handling |
| --- | --- | --- |
| Manual MVP payment | Operational process for manual mark-paid/overrides | Supported and audited. |
| Manual/offline invoice mode | Approved offline process and wording outside repo | Production-like runtime requires manual/offline posture unless real config exists. |
| Fee schedule/VAT | Approved fees, VAT treatment, due-date rules, legal text | Not invented; lower-env markers only. |
| Business Central | Data contract, credentials, mapping, reconciliation | Manual/export boundary only. |
| Online payments | Provider keys, webhooks, signatures, replay/refund rules, PCI/card-flow signoff | Disabled until configured. |

## Product and KBT inputs

| Area | Required setup | Current handling |
| --- | --- | --- |
| Official scoring | Criteria, subcriteria, guidance, thresholds | Configurable lower-env placeholders. |
| Applicant bands/results | Labels, ranges, publication wording | Applicant-safe projection without raw/internal values. |
| Award categories | Community, Heritage, Group criteria/processes | Draft/blocked until supplied. |
| Allocation | Country/operator overrides, live COI import, distance/cluster enrichment, training third-judge approvals | Configurable foundation and override audit. |
| Governance | Legal/compliance approval, KBT UAT/signoff, accessibility acceptance | Checklist items only. |

## Location and registration

| Area | Required setup | Current handling |
| --- | --- | --- |
| What3Words | API key/account, rate limits, error policy | Lower-env enrichment boundary only. |
| OS/ONS data | Approved source/import cadence | Lower-env markers only. |
| Registration email | Sender domain, templates, verification host, bounce handling | Notification intents and queue model only. |

## Operations

| Area | Required setup | Current handling |
| --- | --- | --- |
| Monitoring/alerts | API, DB, jobs, exports, notifications, audit, authorization, public map metrics | Not deployment-configured in repo. |
| Backup/rollback | Backup policy, restore rehearsal, migration rollback plan | Required before production launch. |
| Migration/import | Current-system export files, dry run, reconciliation, rerun/idempotency rules | Synthetic seeds only. |
| Load/security testing | Representative UAT data, load thresholds, pre-launch security scan | External release gates. |

