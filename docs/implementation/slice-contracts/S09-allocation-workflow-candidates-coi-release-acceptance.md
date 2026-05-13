# Slice Contract

This contract is frozen from `docs/implementation/working/current-plan.md` for S09.

See the working plan for the full frozen scope:

- Slice ID: 9
- Title: Allocation workflow: candidates, COI, hold/release, and acceptance
- Contract state: Frozen
- Frozen on: 2026-05-06

Implementation must follow `docs/implementation/source-reconciliation.md`: `REQ-ALO-001` through `REQ-ALO-006`, `REQ-CYC-002`, and Integrated Architecture Section 7 are implementable S09 scope. `OI-004` through `OI-007` are configurable production inputs/import boundaries, not blockers.

## Closure

- Closed on: 2026-05-06
- Status: DONE_FULL
- Delivery record: `docs/implementation/delivery-records/S09-allocation-workflow-candidates-coi-release-acceptance-delivery.md`

Delivered API contracts and runtime behavior for allocation-ready episodes, candidate generation, configurable policy values, COI/rotation markers, hold/release/reassign, judge assignment accept/decline, Full Assessment contact reveal, audit events, judge-count override events, PostgreSQL persistence, OpenAPI entries, and lower-env seeds.

Production-specific allocation inputs remain external/configurable boundaries: country/operator judge-count variants, live COI source, distance/cluster enrichment, and training third-judge authorisation.
