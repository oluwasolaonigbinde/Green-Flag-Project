
import type { SqlClient } from "@green-flag/db";
import type { AdminOverrideEvent } from "../overrides.js";

export async function flushAdminOverrideEvents(client: SqlClient, events: AdminOverrideEvent[]) {
  for (const event of events) {
    const primaryScope = event.actor.scopes[0] ?? { type: "GLOBAL" as const };
    await client.query(
      `
        INSERT INTO admin_override_events (
          id, override_type, target_type, target_id, authority, reason,
          actor_user_id, actor_role, actor_scope_type, actor_scope_id,
          prior_state, after_state, linked_audit_event_id, request_id, correlation_id, created_at_utc
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16::timestamptz)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        event.id,
        event.overrideType,
        event.targetType,
        event.targetId,
        event.authority,
        event.reason,
        event.actor.actorId,
        event.actor.role,
        primaryScope.type,
        primaryScope.id ?? null,
        JSON.stringify(event.priorState),
        JSON.stringify(event.afterState),
        event.linkedAuditEventId ?? null,
        event.requestId,
        event.correlationId ?? null,
        event.createdAt
      ]
    );
  }
}
