import type { AuditEvent } from "@prisma/client";
import { z } from "zod";
import { validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership } from "@/server/permissions/rbac";

export type AuditEventWithJson = AuditEvent;

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const auditEventQuerySchema = z.object({
  action: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  actorUserId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  entityId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  entityType: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  from: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  to: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(50)),
});

export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;

function parseDateBound(value: string | undefined, boundary: "start" | "end") {
  if (!value) {
    return undefined;
  }

  const normalized =
    /^\d{4}-\d{2}-\d{2}$/.test(value) && boundary === "end" ? `${value}T23:59:59.999Z` : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw validationError("Audit event query is invalid.", {
      fieldErrors: {
        [boundary === "start" ? "from" : "to"]: ["Invalid date."],
      },
    });
  }

  return date;
}

export async function listAuditEventsForHousehold(
  userId: string,
  householdId: string,
  query: unknown = {},
) {
  await requireActiveMembership(userId, householdId);
  const parsed = auditEventQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw validationError("Audit event query is invalid.", parsed.error.flatten());
  }

  const from = parseDateBound(parsed.data.from, "start");
  const to = parseDateBound(parsed.data.to, "end");

  return prisma.auditEvent.findMany({
    where: {
      householdId,
      action: parsed.data.action
        ? {
            contains: parsed.data.action,
            mode: "insensitive",
          }
        : undefined,
      actorUserId: parsed.data.actorUserId,
      entityId: parsed.data.entityId,
      entityType: parsed.data.entityType
        ? {
            contains: parsed.data.entityType,
            mode: "insensitive",
          }
        : undefined,
      occurredAt:
        from || to
          ? {
              gte: from,
              lte: to,
            }
          : undefined,
    },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take: parsed.data.limit,
  });
}
