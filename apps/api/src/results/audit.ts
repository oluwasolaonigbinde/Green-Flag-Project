
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AuditEvent, AuditLedger, SessionProfile } from "../auth.js";

export const defaultAuditLedger: AuditLedger = { async append() { return; } };

export function requestMetadata(request: FastifyRequest, idempotencyKey?: string) {
  return {
    requestId: request.id,
    idempotencyKey,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}

export function buildAuditEvent({
  action,
  entityId,
  actor,
  request,
  beforeState,
  afterState,
  reason
}: {
  action: string;
  entityId?: string;
  actor: SessionProfile["actor"];
  request: ReturnType<typeof requestMetadata>;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | undefined;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor,
    action,
    entityType: "decision_result",
    entityId,
    beforeState,
    afterState,
    request,
    ...(reason ? { reason } : {}),
    createdAt: new Date().toISOString()
  };
}
