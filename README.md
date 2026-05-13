# Green Flag Award Platform

This repository contains the Green Flag Award rebuild. The backend is episode-first, DB-first for production-like runtime, and ready for AWS staging/UAT handoff with external gates. This is not production launch approval.

## Start here

- Current state: `docs/implementation/system_state.md`
- Agent rules: `AGENTS.md`
- Frontend handoff: `docs/implementation/frontend-contract-handoff.md`
- DevOps/AWS handoff: `docs/implementation/devops-aws-handoff.md`
- External gates: `docs/implementation/external-configuration-register.md`
- API contracts: `openapi/openapi.json` and `packages/contracts/src/schemas.ts`

Long reports under `docs/implementation/working/` are historical audit evidence, not normal read-first docs.

## Workspace

- `apps/api` - Fastify TypeScript API.
- `apps/web` - Next.js App Router frontend.
- `packages/contracts` - shared Zod DTOs, enums, fixtures, and contract checks.
- `packages/db` - PostgreSQL/PostGIS migrations and seed/migration checks.
- `packages/shared` - shared utilities.
- `openapi` - generated/checked OpenAPI contract artifact.

## Commands

Use pnpm through Corepack:

```powershell
corepack enable
corepack prepare pnpm@10.10.0 --activate
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm contracts:check
corepack pnpm openapi:check
corepack pnpm db:migrate:check
corepack pnpm db:seed:check
corepack pnpm db:integration:test
corepack pnpm db:migration:apply:check
```

Do not run clean migration apply checks against staging, production, shared UAT, or personal databases.
