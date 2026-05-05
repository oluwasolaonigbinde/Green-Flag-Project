# Slice Delivery Record

## Metadata

- Slice ID: 2
- Title: Organisations, parks, locations, cycles, and episodes
- Closed status: DONE_FULL
- Closed at: 2026-05-05
- Contract path: docs/implementation/slice-contracts/S02-organisations-parks-locations-cycles-episodes.md

## Delivered capability

Slice 2 now provides the canonical domain model foundation for the Green Flag platform:

- Organisations and parks can be represented canonically.
- Park locations can store geospatial and geography-enrichment fields for later registration and allocation flows.
- Award tracks/categories are persisted with operational status.
- Award cycles and cycle windows support overlapping annual windows.
- `assessment_episodes` is the lifecycle root and enforces the per-park/per-type/per-cycle-year uniqueness rule.
- Synthetic lower-env seeds exist for the new domain model.
- Shared contracts now include organisation/park/location/cycle/episode read models and fixtures.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `corepack pnpm lint` | PASS | ESLint passed |
| `corepack pnpm test` | PASS | 18 tests passed across contracts, db, and API coverage |
| `corepack pnpm build` | PASS | Workspace build passed for shared, contracts, db, api, and web |
| `corepack pnpm typecheck` | PASS | Workspace typecheck passed after rebuild |
| `corepack pnpm contracts:check` | PASS | `packages/contracts/src/contracts.test.ts` passed |
| `corepack pnpm openapi:check` | PASS | OpenAPI skeleton check passed |
| `corepack pnpm db:migrate:check` | PASS | Migration convention check passed for 3 files |
| `corepack pnpm db:seed:check` | PASS | Lower-env seed safety check passed for 2 files |

## Frontend status

- Status: complete
- Gaps recorded: none
- Reopen trigger: none

## Backend handoff

The backend now has the canonical organisation/park/cycle/episode foundation needed by registration and dashboard slices. Later slices can attach mutating commands and read models without redefining the episode-first data model.

## Frontend handoff

No Slice 2 UI was delivered. Existing UI evidence only informed the read-model shape.

## Client-safe summary

The platform now has the canonical data model for organisations, parks, locations, award tracks, award cycles, cycle windows, and assessment episodes. That gives later slices a stable foundation for registration, dashboards, allocation, and mystery shop handling without conflating application state with episode state.

## Residual risks

- Production geocoding and live migration data are still later-slice concerns.
- The dual-window model is grounded in the PRD/architecture; later slices must continue to preserve the episode-first boundary.
