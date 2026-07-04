import type { AuditEventWithJson } from "./service";

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
    occurredAt: event.occurredAt.toISOString(),
  };
}

export type SerializedAuditEvent = ReturnType<typeof serializeAuditEvent>;
