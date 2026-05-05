import {
  createPostgresPool,
  readPostgresRuntimeConfig,
  type SqlClient,
  type SqlPool
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
  constructor(private readonly client: SqlClient) {}

  async append(event: AuditEvent): Promise<void> {
    const parsed = auditEventSchema.parse(event);
    const primaryScope = parsed.actor.scopes[0] ?? { type: "GLOBAL" as const };
    await this.client.query(
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
  resolveSession: SessionResolver;
  auditLedger: AuditLedger;
}

export function createPostgresApiRuntime(env: NodeJS.ProcessEnv = process.env): PostgresApiRuntime | null {
  const dbConfig = readPostgresRuntimeConfig(env);
  if (!dbConfig) {
    return null;
  }

  const issuer = env.COGNITO_ISSUER;
  const audience = env.COGNITO_AUDIENCE;
  const jwksUrl = env.COGNITO_JWKS_URL;
  if (!issuer || !audience || !jwksUrl) {
    throw new Error("DATABASE_URL was configured, but COGNITO_ISSUER, COGNITO_AUDIENCE, and COGNITO_JWKS_URL are required for production API runtime wiring.");
  }

  const pool = createPostgresPool(dbConfig);
  return {
    pool,
    resolveSession: createSessionResolver({
      identityRepository: new PostgresIdentityRepository(pool),
      verifyBearerToken: createCognitoJwtVerifier({ issuer, audience, jwksUrl })
    }),
    auditLedger: new PostgresAuditLedger(pool)
  };
}
