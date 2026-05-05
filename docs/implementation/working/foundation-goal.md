# Foundation Goal

```text
/goal Continue the Green Flag implementation from the completed Slice 0 foundation.

Context:
- Slice 0 is DONE_FULL.
- Foundation commit: 0ba3ff7 chore: complete slice 0 foundation scaffold.
- Slice 1 is the next TODO backlog item.
- The repo already has a runnable pnpm TypeScript monorepo scaffold with apps/api, apps/web, packages/contracts, packages/db, packages/shared, OpenAPI, and migration/seed checks.

Read first:
- AGENTS.md
- docs/implementation/agent-operating-model.md
- docs/implementation/slice-backlog.yaml
- docs/implementation/system_state.md
- docs/implementation/gap-register.md
- docs/implementation/ui-slice-map.yaml
- docs/implementation/working/current-plan.md
- docs/implementation/working/current-plan-review.md
- docs/implementation/working/current-implementation-review.md
- docs/implementation/commands/*.md
- docs/implementation/slice-contracts/
- docs/implementation/delivery-records/
- docs/source/
- docs/figma-manifest.json and docs/figma-manifest.md, then only the docs/figma files mapped to the current slice

Operating mode:
- Act as a persistent manager/orchestrator.
- Follow the repo workflow exactly: orient/status, plan-next-slice if no active slice exists, review contract, build, review implementation, close only when gates pass.
- Do not skip backlog order or work on optional demo slices unless a human explicitly instructs it.
- At most one slice may be CONTRACT_REVIEW, IN_PROGRESS, or REOPENED_FOR_UI.

Subagents:
- Use read-only subagents once per major cycle for repo state, architecture mapping, contracts/read-models, security/redaction, and QA.
- Merge findings first; the manager/orchestrator performs all edits sequentially.
- If subagents are unavailable, continue solo and record that limitation.

Implementation rules:
- Build only the current frozen contract.
- If no active slice exists, create and review the next slice contract before coding.
- Use the existing pnpm TypeScript scaffold and conventions.
- assessment_episodes is the lifecycle root; applications owns applicant package state only.
- Enforce Mystery Shop secrecy server-side; RBAC, redaction, and audit are backend responsibilities.
- Do not invent fees, VAT, scoring criteria, score bands, legal wording, provider credentials, KBT approvals, or other unresolved production values.
- If frontend screens are missing but backend/API is clear, proceed with contracts, mocks, stubs, and explicit frontend gap records.

Continuation policy:
- Continue only while the next slice is the first eligible TODO, dependencies are satisfied, source truth is precise enough, and no unresolved external value or approval is needed.
- Stop if the contract cannot be made precise or if implementation shows the contract is wrong; return to CONTRACT_REVIEW instead of improvising.

Validation:
- Run available relevant checks; use Corepack if pnpm is unavailable.
- Review the diff against the frozen contract and score scaffold fit, architecture alignment, testability, RBAC/audit/redaction safety, and future-agent usability.
- Fix anything below 8 before closing the slice.

Workflow and delivery:
- Update current plan/system state/review notes where the repo workflow requires it.
- Update the delivery record at the end.
- Commit each closed slice separately, push when checks pass, and report files, checks, decisions, assumptions, blockers, and next recommended /goal.
```
