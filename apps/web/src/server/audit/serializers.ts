import type { AuditEventWithJson, AuditHashChainSummary } from "./service";

export function serializeAuditEvent(event: AuditEventWithJson) {
  return {
    id: event.id,
    householdId: event.householdId,
    actorUserId: event.actorUserId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    before: event.before,
    after: event.after,
    metadata: event.metadata,
    prevHash: event.prevHash,
    eventHash: event.eventHash,
    occurredAt: event.occurredAt.toISOString(),
  };
}

export function serializeAuditHashChain(summary: AuditHashChainSummary) {
  return summary;
}

export type SerializedAuditEvent = ReturnType<typeof serializeAuditEvent>;
export type SerializedAuditHashChain = ReturnType<typeof serializeAuditHashChain>;
