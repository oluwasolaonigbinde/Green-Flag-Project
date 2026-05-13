# S09 Allocation Workflow Delivery

## Status

- Slice: 9
- Status: DONE_FULL
- Closed: 2026-05-06
- Contract: `docs/implementation/slice-contracts/S09-allocation-workflow-candidates-coi-release-acceptance.md`

## Delivered

- Configurable allocation policy contracts and lower-env seed data.
- PostgreSQL tables for allocation policy configs, allocations, judge assignments, and allocation COI flags.
- API routes for allocation-ready episodes, candidate query, hold, release, reassign, assessor assignments, accept, and decline.
- Candidate generation from assessor profile/capacity data with hard exclusion, soft/rotation flags, score penalty, and acknowledgement requirements.
- Transactional allocation mutations through the existing UnitOfWork runtime boundary, including episode status persistence and audit writes.
- Admin override events for judge-count overrides with reason, target, prior/after state, linked audit id, actor, request id, and correlation/idempotency key.
- Scoped RBAC for admin allocation operations and judge self-assignment decisions.
- Full Assessment contact details stay hidden until released assignments are accepted; held assignments are invisible to judges.
- OpenAPI skeleton entries and contract fixtures/tests.

## Deferred

- Exact candidate review/map/hold-release/reassignment frontend variants remain frontend gaps.
- Production country/operator judge-count variants, live COI import source, distance/cluster enrichment, and training third-judge authorisation remain configurable/import boundaries.
- Mystery-specific allocation redaction hardening remains S10 scope.
- Visit scheduling, scoring, assessment submission, decisions, publication, notifications, messaging, exports, and public map updates remain later slices.

## Checks

- `corepack pnpm install --frozen-lockfile`: PASS
- `corepack pnpm contracts:check`: PASS
- `corepack pnpm openapi:check`: PASS
- `corepack pnpm db:migrate:check`: PASS
- `corepack pnpm db:seed:check`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS
- `corepack pnpm build`: PASS
- `corepack pnpm typecheck`: PASS
- `corepack pnpm db:integration:test`: PASS

Note: An earlier concurrent run of `build` and root `typecheck` caused a transient Next.js `.next` rename failure because `typecheck` invokes `build`. Rerunning `typecheck` by itself passed.
