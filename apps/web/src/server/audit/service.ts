import type { AuditEvent } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership } from "@/server/permissions/rbac";

export type AuditEventWithJson = AuditEvent;

export async function listAuditEventsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.auditEvent.findMany({
    where: {
      householdId,
    },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take: 50,
  });
}
