import {
  createPostgresPool,
  createUnitOfWork,
  readPostgresRuntimeConfig,
  type SqlClient,
  type SqlPool,
  type UnitOfWork
} from "@green-flag/db";
import {
  auditEventSchema,
  internalUserSummarySchema,
  roleAssignmentSchema
} from "@green-flag/contracts";
import {
  createCognitoJwtVerifier,
  createSessionResolver,
  type AuditEvent,
  type AuditLedger,
  type IdentityReadRepository,
  type InternalUserSummary,
  type RoleAssignment,
  type SessionResolver
} from "./auth.js";
import { createPostgresDomainStores, type DomainStoreBundle } from "./postgres-domain-stores.js";
import { assertProductionRuntimeSafety, isProductionLikeRuntime } from "./runtime-safety.js";
import { PostgresRegistrationRepository, type RegistrationRepository } from "./postgres-domain-stores/registration-repository.js";
import { PostgresApplicantRepository, type ApplicantRepository } from "./postgres-domain-stores/applicant-repository.js";
import { PostgresAssessorRepository, type AssessorRepository } from "./postgres-domain-stores/assessor-repository.js";
import { PostgresAllocationRepository, type AllocationRepository } from "./postgres-domain-stores/allocation-repository.js";
import { PostgresAssessmentRepository, type AssessmentRepository } from "./postgres-domain-stores/assessment-repository.js";

interface InternalUserRow {
  id: string;
  email: string | null;
  display_name: string;
  status: string;
}

interface RoleAssignmentRow {
  id: string;
  internal_user_id: string;
  role_type: string;
  scope_type: string;
  scope_id: string | null;
  status: string;
  redaction_profile: string;
}

export class PostgresIdentityRepository implements IdentityReadRepository {
  constructor(private readonly client: SqlClient) {}

  async findInternalUserByCognitoSubject(subject: string): Promise<InternalUserSummary | null> {
    const result = await this.client.query<InternalUserRow>(
      `
        SELECT u.id, u.email, u.display_name, u.status
        FROM internal_users u
        JOIN cognito_identity_links l ON l.internal_user_id = u.id
        WHERE l.cognito_subject = $1
        LIMIT 1
      `,
      [subject]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return internalUserSummarySchema.parse({
      id: row.id,
      cognitoSubject: subject,
      email: row.email ?? undefined,
      displayName: row.display_name,
      status: row.status
    });
  }

  async listRoleAssignmentsByUserId(userId: string): Promise<RoleAssignment[]> {
    const result = await this.client.query<RoleAssignmentRow>(
      `
        SELECT id, internal_user_id, role_type, scope_type, scope_id, status, redaction_profile
        FROM role_assignments
        WHERE internal_user_id = $1
        ORDER BY created_at_utc ASC
      `,
      [userId]
    );

    return result.rows.map((row) =>
      roleAssignmentSchema.parse({
        id: row.id,
        internalUserId: row.internal_user_id,
        role: row.role_type,
        scope: {
          type: row.scope_type,
          ...(row.scope_id ? { id: row.scope_id } : {})
        },
        status: row.status,
        redactionProfile: row.redaction_profile
      })
    );
  }
}

export class PostgresAuditLedger implements AuditLedger {
  constructor(private readonly client: SqlClient, private readonly unitOfWork?: UnitOfWork) {}

  async append(event: AuditEvent): Promise<void> {
    const parsed = auditEventSchema.parse(event);
    const primaryScope = parsed.actor.scopes[0] ?? { type: "GLOBAL" as const };
    const client = this.unitOfWork?.currentClient() ?? this.client;
    if (parsed.actor.role === "SYSTEM") {
      await client.query(
        `
          INSERT INTO internal_users (id, email, display_name, status, redaction_profile)
          VALUES ($1, $2, $3, 'ACTIVE', $4)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          parsed.actor.actorId,
          `${parsed.actor.cognitoSubject}@system.local`,
          parsed.actor.cognitoSubject,
          parsed.actor.redactionProfile
        ]
      );
    }
    await client.query(
      `
        INSERT INTO audit_events (
          id,
          actor_user_id,
          actor_role,
          actor_scope_type,
          actor_scope_id,
          action,
          entity_type,
          entity_id,
          before_state,
          after_state,
          reason,
          request_id,
          idempotency_key,
          ip_address,
          user_agent,
          created_at_utc
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16::timestamptz)
      `,
      [
        parsed.id,
        parsed.actor.actorId,
        parsed.actor.role,
        primaryScope.type,
        primaryScope.id ?? null,
        parsed.action,
        parsed.entityType,
        parsed.entityId ?? null,
        parsed.beforeState === undefined ? null : JSON.stringify(parsed.beforeState),
        parsed.afterState === undefined ? null : JSON.stringify(parsed.afterState),
        parsed.reason ?? null,
        parsed.request.requestId,
        parsed.request.idempotencyKey ?? null,
        parsed.request.ipAddress ?? null,
        parsed.request.userAgent ?? null,
        parsed.createdAt
      ]
    );
  }
}

export interface PostgresApiRuntime {
  pool: SqlPool;
  unitOfWork: UnitOfWork;
  resolveSession: SessionResolver;
  auditLedger: AuditLedger;
  stores: DomainStoreBundle;
  registrationRepository: RegistrationRepository;
  applicantRepository: ApplicantRepository;
  assessorRepository: AssessorRepository;
  allocationRepository: AllocationRepository;
  assessmentRepository: AssessmentRepository;
}

export { isProductionLikeRuntime } from "./runtime-safety.js";

export async function createPostgresApiRuntime(env: NodeJS.ProcessEnv = process.env): Promise<PostgresApiRuntime | null> {
  const dbConfig = readPostgresRuntimeConfig(env);
  if (!dbConfig) {
    if (isProductionLikeRuntime(env)) {
      assertProductionRuntimeSafety({ env, databaseConfigured: false });
    }
    return null;
  }
  assertProductionRuntimeSafety({ env, databaseConfigured: true, dbFirstRepositoriesConfigured: true });

  const issuer = env.COGNITO_ISSUER;
  const audience = env.COGNITO_AUDIENCE;
  const jwksUrl = env.COGNITO_JWKS_URL;
  if (!issuer || !audience || !jwksUrl) {
    throw new Error("DATABASE_URL was configured, but COGNITO_ISSUER, COGNITO_AUDIENCE, and COGNITO_JWKS_URL are required for production API runtime wiring.");
  }

  const pool = createPostgresPool(dbConfig);
  const unitOfWork = createUnitOfWork(pool);
  const auditLedger = new PostgresAuditLedger(pool, unitOfWork);
  const allowLowerEnvironmentFixtures = !isProductionLikeRuntime(env);
  return {
    pool,
    unitOfWork,
    resolveSession: createSessionResolver({
      identityRepository: new PostgresIdentityRepository(pool),
      verifyBearerToken: createCognitoJwtVerifier({ issuer, audience, jwksUrl })
    }),
    auditLedger,
    registrationRepository: new PostgresRegistrationRepository(pool, unitOfWork, auditLedger, {
      allowStaticLowerEnvVerificationToken: allowLowerEnvironmentFixtures
    }),
    applicantRepository: new PostgresApplicantRepository(pool, unitOfWork, auditLedger),
    assessorRepository: new PostgresAssessorRepository(pool, unitOfWork, auditLedger),
    allocationRepository: new PostgresAllocationRepository(pool, unitOfWork, auditLedger),
    assessmentRepository: new PostgresAssessmentRepository(pool, unitOfWork, auditLedger),
    stores: await createPostgresDomainStores({
      client: pool,
      unitOfWork,
      allowLowerEnvironmentFixtures
    })
  };
}
