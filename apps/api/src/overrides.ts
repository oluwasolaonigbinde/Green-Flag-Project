import { randomUUID } from "node:crypto";
import type { SessionProfile } from "./auth.js";

export interface AdminOverrideEvent {
  id: string;
  overrideType: string;
  targetType: string;
  targetId: string;
  authority: string;
  reason: string;
  actor: SessionProfile["actor"];
  priorState: unknown;
  afterState: unknown;
  linkedAuditEventId?: string;
  requestId: string;
  correlationId?: string;
  createdAt: string;
}

export function buildAdminOverrideEvent({
  overrideType,
  targetType,
  targetId,
  authority,
  reason,
  actor,
  priorState,
  afterState,
  linkedAuditEventId,
  requestId,
  correlationId
}: Omit<AdminOverrideEvent, "id" | "createdAt">): AdminOverrideEvent {
  return {
    id: randomUUID(),
    overrideType,
    targetType,
    targetId,
    authority,
    reason,
    actor,
    priorState,
    afterState,
    ...(linkedAuditEventId ? { linkedAuditEventId } : {}),
    requestId,
    ...(correlationId ? { correlationId } : {}),
    createdAt: new Date().toISOString()
  };
}
