
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AuditEvent, AuditLedger, SessionProfile } from "../auth.js";

export const defaultAuditLedger: AuditLedger = {
  async append() {
    return;
  }
};

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
  entityType = "application",
  entityId,
  actor,
  request,
  beforeState,
  afterState
}: {
  action: string;
  entityType?: string;
  entityId?: string;
  actor: SessionProfile["actor"];
  request: ReturnType<typeof requestMetadata>;
  beforeState?: unknown;
  afterState?: unknown;
}): AuditEvent {
  return {
    id: randomUUID(),
    actor,
    action,
    entityType,
    entityId,
    beforeState,
    afterState,
    request,
    createdAt: new Date().toISOString()
  };
}
