# S13 Notifications, Messaging, Jobs, Exports, And Renewal Reminders

## Metadata

- Slice ID: 13
- Title: Notifications, messaging, jobs, exports, and renewal reminders
- Status: Frozen
- Planned on: 2026-05-06

## Objective

Deliver the adapter-backed communications and operations foundation after normalized read models: template versions, notification queue/log, email/SMS adapter boundaries, Mystery suppression logs, message threads, job runs, renewal reminder jobs, and generic exports.

## Scope

- Add lower-env notification template versions and immutable queue/log records.
- Add suppression records for Mystery/applicant redaction and opted-out/deferred channels.
- Add applicant/admin message thread contracts with Mystery-safe applicant projections.
- Add job run records for renewal reminders and public-map/export processing shells.
- Add generic export job/artifact contracts that enforce RBAC/redaction at request time.
- Keep provider delivery disabled unless future deployment config supplies adapters.
- Emit audit records for admin/user commands that create messages or exports.

## Out Of Scope

- Real email/SMS delivery.
- Provider credentials or webhook handling.
- Business Central automation.
- Public-map dispatch worker.
- Official notification copy, legal wording, applicant score bands, or export format sign-off.

## API Scope

- `GET /api/v1/admin/notifications/queue`
- `POST /api/v1/admin/notifications/:notificationId/dispatch-stub`
- `GET /api/v1/applicant/messages`
- `POST /api/v1/applicant/messages`
- `GET /api/v1/admin/messages`
- `POST /api/v1/admin/messages`
- `POST /api/v1/admin/jobs/renewal-reminders/run`
- `GET /api/v1/admin/jobs`
- `POST /api/v1/admin/exports`
- `GET /api/v1/admin/exports`

## Closure

- Closed on: 2026-05-06
- Status: DONE_FULL
- Delivery record: `docs/implementation/delivery-records/S13-notifications-messaging-jobs-exports-reminders-delivery.md`
