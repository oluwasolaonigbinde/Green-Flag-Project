# Green Flag Award Platform

This repository now contains the Slice 0 foundation scaffold for the Green Flag Award rebuild.

## Workspace

- `apps/api` - Fastify TypeScript API scaffold.
- `apps/web` - Next.js App Router scaffold.
- `packages/contracts` - shared Zod DTOs, enums, redaction profiles, fixtures, and contract checks.
- `packages/db` - PostgreSQL/PostGIS migration and lower-environment seed conventions.
- `packages/shared` - shared utility types/helpers.
- `openapi` - OpenAPI skeleton for foundation endpoints.

## Commands

Use pnpm through Corepack if `pnpm` is not already installed:

```powershell
corepack enable
corepack prepare pnpm@10.10.0 --activate
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:check
pnpm openapi:check
pnpm db:migrate:check
pnpm db:seed:check
```

The scaffold intentionally does not implement identity, RBAC persistence, audit persistence, business workflows, production fees, VAT, legal wording, scoring criteria, provider credentials, or KBT approvals. Those remain governed by later backlog slices and external dependency records.
