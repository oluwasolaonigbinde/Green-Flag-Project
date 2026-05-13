# S12 Decisions, Results, Certificates, And Public Map Events

## Metadata

- Slice ID: 12
- Title: Decisions, result publication, certificates, and public map events
- Status: Frozen
- Planned on: 2026-05-06

## Objective

Deliver the episode-first result foundation after submitted assessments: admin decision hold, threshold acknowledgement, Full batch release, Mystery-safe publication, result artifact/certificate shells, derived park award cache, and public map update events.

## Scope

- Add decision result contracts and persistence rooted on `assessment_episodes`.
- Derive decision readiness from S11 submitted judge assessments and configurable threshold booleans only.
- Require admin reason for threshold overrides or publication withdrawal.
- Emit audit events for decision hold, publish, and withdraw commands.
- Emit append-only `public_map_update_events` as an adapter boundary, without implementing a production public-map integration.
- Expose applicant-safe result/certificate projection after publication.
- Preserve Mystery secrecy: applicant/org surfaces must not expose raw scores, assessment timestamps, judge identity, visit dates, assignment state, or internal decision notes.

## Out Of Scope

- Official scoring criteria text.
- Applicant score bands/ranges.
- Legal certificate wording.
- Public map endpoint/provider details.
- Notification delivery, messaging, exports, and renewal jobs.
- Any decision/publication lifecycle state owned by `applications`.

## API Scope

- `GET /api/v1/admin/results/:episodeId`
- `POST /api/v1/admin/results/:episodeId/hold`
- `POST /api/v1/admin/results/:decisionId/publish`
- `POST /api/v1/admin/results/:decisionId/withdraw`
- `GET /api/v1/applicant/results/:episodeId`

## Closure

- Closed on: 2026-05-06
- Status: DONE_FULL
- Delivery record: `docs/implementation/delivery-records/S12-decisions-results-certificates-public-map-events-delivery.md`
