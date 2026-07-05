import { CalendarEventType } from "@prisma/client";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { createExpenseProposalFromCalendarEventForHousehold } from "./service";

type GenerateRecurringExpenseOptions = {
  now?: Date;
  maxItems?: number;
  dryRun?: boolean;
};

type GenerateRecurringExpenseFailure = {
  eventId: string;
  message: string;
  code: string | null;
};

export type GenerateRecurringExpenseSummary = {
  candidateEvents: number;
  attempted: number;
  created: number;
  skippedExisting: number;
  failed: number;
  dryRun: boolean;
  failures: GenerateRecurringExpenseFailure[];
};

const defaultMaxItems = 200;

function clampMaxItems(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return defaultMaxItems;
  }

  return Math.min(1000, Math.max(1, Math.trunc(value)));
}

function stringArrayFromJson(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(
      400,
      "INVALID_RECURRING_EXPENSE_TEMPLATE",
      "Recurring expense template debtor list is invalid.",
    );
  }

  return value;
}

function createEmptySummary(dryRun: boolean): GenerateRecurringExpenseSummary {
  return {
    candidateEvents: 0,
    attempted: 0,
    created: 0,
    skippedExisting: 0,
    failed: 0,
    dryRun,
    failures: [],
  };
}

function addFailure(summary: GenerateRecurringExpenseSummary, eventId: string, error: unknown) {
  summary.failed += 1;

  if (summary.failures.length >= 20) {
    return;
  }

  summary.failures.push({
    eventId,
    code: error instanceof ApiError ? error.code : null,
    message: error instanceof Error ? error.message : String(error),
  });
}

export async function generateRecurringExpenseProposals(
  options: GenerateRecurringExpenseOptions = {},
): Promise<GenerateRecurringExpenseSummary> {
  const now = options.now ?? new Date();
  const maxItems = clampMaxItems(options.maxItems);
  const summary = createEmptySummary(Boolean(options.dryRun));
  const templates = await prisma.recurringExpenseTemplate.findMany({
    where: {
      event: {
        type: CalendarEventType.RECURRING_EXPENSE_GENERATION,
        status: "OPEN",
        startAt: {
          lte: now,
        },
      },
    },
    include: {
      event: true,
    },
    orderBy: [{ event: { startAt: "asc" } }, { createdAt: "asc" }],
    take: maxItems,
  });
  summary.candidateEvents = templates.length;

  if (templates.length === 0) {
    return summary;
  }

  const existingProposalLinks = await prisma.eventLink.findMany({
    where: {
      eventId: {
        in: templates.map((template) => template.eventId),
      },
      linkedType: "expense_proposal",
    },
    select: {
      eventId: true,
    },
  });
  const eventIdsWithProposal = new Set(existingProposalLinks.map((link) => link.eventId));

  for (const template of templates) {
    if (eventIdsWithProposal.has(template.eventId)) {
      summary.skippedExisting += 1;
      continue;
    }

    summary.attempted += 1;

    if (summary.dryRun) {
      continue;
    }

    try {
      await createExpenseProposalFromCalendarEventForHousehold(
        template.createdByUserId,
        template.householdId,
        template.eventId,
        {
          title: template.title ?? undefined,
          description: template.description ?? undefined,
          merchant: template.merchant ?? undefined,
          categoryId: template.categoryId ?? undefined,
          originalAmount: template.originalAmount.toString(),
          originalCurrency: template.originalCurrency,
          fxRate: template.fxRate?.toString() ?? undefined,
          participantUserIds: stringArrayFromJson(template.participantUserIds),
          splitMethod: "EQUAL",
        },
      );
      summary.created += 1;
    } catch (error) {
      if (error instanceof ApiError && error.code === "EVENT_EXPENSE_PROPOSAL_EXISTS") {
        summary.skippedExisting += 1;
        continue;
      }

      addFailure(summary, template.eventId, error);
    }
  }

  return summary;
}
