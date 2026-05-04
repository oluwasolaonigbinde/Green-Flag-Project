# Foundation Goal Prompt

```text
/goal Build the Green Flag foundation track as a persistent manager/orchestrator run.

Read AGENTS.md first. Then read the repo's implementation source of truth:
- docs/implementation/agent-operating-model.md
- docs/implementation/slice-backlog.yaml
- docs/implementation/system_state.md
- docs/implementation/gap-register.md
- docs/implementation/ui-slice-map.yaml
- docs/implementation/working/current-plan.md
- docs/implementation/working/current-plan-review.md
- docs/implementation/working/current-implementation-review.md
- docs/implementation/slice-contracts/
- docs/implementation/delivery-records/templates/delivery-record-template.md
- docs/source/
- docs/figma-manifest.json and docs/figma-manifest.md first, then only the mapped files in docs/figma/ that are relevant to the current slice

Meaning of "foundation track":
Move this repo from docs-only to a real runnable scaffold with a contract/workflow base that future slices can build on. Do not treat this as docs cleanup.

Operating rules:
- Treat this as one persistent goal, not a one-off prompt.
- The backlog decides legal work. Do not guess scope.
- Continue across slices only while the next slice is the next legal backlog item, its dependencies are satisfied, and no unresolved external business data, approvals, or production values are required.
- Do not stop just because Slice 0 passes if there is more backlog-legal foundation work that can be completed safely.
- Stop before any slice that would force inventing scoring bands, fees, VAT, legal wording, provider credentials, KBT approvals, or similar unresolved external values.
- Do not re-read the same large docs repeatedly; extract the needed facts once, then work from the merged facts.
- Keep chat updates short; write the real detail into repo docs.
- Use the existing command docs under docs/implementation/commands/ when planning, reviewing, building, and closing slices. Do not invent a parallel workflow.

Use subagents once each, read-only, then merge and proceed sequentially:
1. Repo inspection
2. Architecture mapping
3. Contracts/read-model derivation
4. Security/redaction
5. QA planning

Subagent rules:
- Read-only only.
- No parallel edits.
- No duplicate subagents for the same question.
- Do not ask a second subagent to re-check facts the first one already settled.
- The manager/orchestrator performs all edits sequentially after merging subagent findings.

Implementation expectation:
- Slice 0 outcome is non-negotiable: if the repo does not already have the scaffold, produce actual app/package structure, baseline scripts, contract conventions, and delivery-record workflow.
- After that, continue through later backlog-legal slices only if the scaffold and checks are stable.
- Build only what the backlog allows in order.

Default scaffold stack if no stronger repo convention exists:
- pnpm workspace
- TypeScript
- apps/web: Next.js App Router
- apps/api: Fastify TypeScript API
- packages/contracts: shared TypeScript/Zod DTOs, enums, and fixtures
- packages/db: PostgreSQL/PostGIS migration/schema package, preferably Drizzle or SQL migrations if no existing convention exists
- packages/shared: shared utilities/types
- Vitest for tests
- ESLint/Prettier where practical
- docker-compose for local PostgreSQL/PostGIS only if no existing dev DB setup exists

Phase guidance:
1. Real scaffold first. If no stronger repo convention exists, create the actual runnable monorepo scaffold, root scripts, TypeScript config, and package boundaries needed for the foundation.
2. Contracts next. Create canonical enums, types, and read-model fixtures from the hydrated docs. Treat UI-derived shapes as provisional where the docs do not fully settle them.
3. API/DB/web foundations next only when the slice order allows and the needed docs evidence exists. Do not invent production business values or unresolved external integrations.
4. Use the repo's workflow files to record current plan, contract review, implementation review, delivery record, and system state updates.

Hard rules:
- assessment_episodes is the lifecycle root.
- applications owns applicant package state only.
- Mystery Shop secrecy is server-side policy across APIs, read models, notifications, documents, messages, exports, search, and status labels.
- UI evidence shapes layout and read models only; product and architecture docs win on business rules.
- Do not implement or invent production fees, VAT values, official scoring criteria, applicant score bands, legal wording, provider credentials, or KBT approvals.
- Do not create parallel workflow docs if the existing docs/implementation conventions already cover it.

Validation:
- Run install/build/typecheck/test/lint/contract checks where available or newly created.
- Fix failures caused by this work.
- If a command cannot run, record exactly why and what should be run next.
- Use one review subagent after implementation to compare the diff against the plan and score the result from 1-10 across scaffold quality, architecture alignment, testability, Mystery redaction safety, and future-agent usability.
- If any score is below 8, fix the issues and review again.

Workflow/delivery record:
- Update the current plan/system state before implementation where the repo workflow requires it.
- Update review notes after planning/review passes.
- Update the delivery record at the end using the repo's delivery-record convention.
- Record files changed, commands run, tests/checks passed/failed, decisions made, inferred/provisional assumptions, blockers, and the next recommended /goal.

Stop condition:
Stop only when the current goal is materially complete or a real blocker is reached. Before stopping, give a short report with files changed, decisions made, tests/checks run, blockers, and the next recommended /goal.
```
