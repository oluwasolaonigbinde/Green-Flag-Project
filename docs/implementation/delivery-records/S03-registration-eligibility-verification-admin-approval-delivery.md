# Slice Delivery Record

## Metadata

- Slice ID: 3
- Title: Registration, eligibility, verification, and admin approval
- Closed status: DONE_BACKEND
- Closed at: 2026-05-05
- Contract path: docs/implementation/slice-contracts/S03-registration-eligibility-verification-admin-approval.md

## Delivered capability

Slice 3 now provides the public-to-admin registration workflow:

- Park registration submission with eligibility validation.
- Duplicate warning and acknowledgement handling.
- Mock W3W, OS Open Greenspace, and ONS geography enrichment response contracts.
- Email verification state transition.
- Admin registration review queue with approve/reject actions.
- Notification intent contracts for verification, duplicate alert, approval, and rejection.
- Audit-backed registration state changes.
- Registration workflow migration and lower-env seed fixture.
- OpenAPI registration endpoint coverage.
- Frontend fallback routes for registration, verification, and admin review.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `corepack pnpm lint` | PASS | ESLint completed with no errors |
| `corepack pnpm test` | PASS | 25 tests passed across db, contracts, auth, foundation API, and registration API |
| `corepack pnpm build` | PASS | Workspace build passed; Next emitted the known non-blocking plugin warning |
| `corepack pnpm typecheck` | PASS | Workspace typecheck passed after rebuild |
| `corepack pnpm contracts:check` | PASS | 7 contract tests passed |
| `corepack pnpm openapi:check` | PASS | Required foundation and registration paths/schemas present |
| `corepack pnpm db:migrate:check` | PASS | Migration convention check passed for 4 files |
| `corepack pnpm db:seed:check` | PASS | Lower-env seed safety check passed for 3 files |
| API smoke | PASS | `POST /api/v1/registrations` returned `201 PENDING_VERIFICATION` |
| Frontend route check | PASS_WITH_FRONTEND_GAPS | `/register`, `/register/verify`, and `/admin/registrations` returned 200 on `http://127.0.0.1:3002` |

## Frontend status

- Status: partial
- Gaps recorded: FE-011 and FE-012
- Reopen trigger: registration verification PNG export or exact admin registration review queue PNG export arrives

## Backend handoff

Registration uses its own workflow root and consumes the Slice 1 audit/RBAC foundation plus Slice 2 canonical park/organisation activation boundaries. Later applicant application work should consume the approved registration/park handoff rather than redefining registration state.

## Frontend handoff

The available application wizard and Super Admin queue evidence is represented by `/register`, `/register/verify`, and `/admin/registrations`. Exact verification and registration-review queue screens remain open frontend evidence gaps.

## Client-safe summary

The platform can now accept park registrations, validate eligibility, flag duplicate risk, verify email ownership, and let admins approve or reject registrations through auditable API contracts. Frontend routes exist for the journey, with exact missing screen variants recorded for later design alignment.

## Residual risks

- Live W3W, OS Open Greenspace, ONS, and email delivery remain adapter/provider configuration work; this slice ships safe mocks/contracts only.
- Exact verification landing and admin registration review queue designs remain unavailable and should reopen this slice for UI-only work when exported.
