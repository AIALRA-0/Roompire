import type { Prisma } from "@prisma/client";
import { pendingSha256 } from "@/server/files/service";
import { prisma } from "@/server/db/prisma";
import { requireHouseholdSettingsManager } from "@/server/permissions/rbac";

type RetentionRecordType =
  | "expense_proposal"
  | "proposal_comment"
  | "proposal_approval"
  | "settlement"
  | "calendar_event"
  | "task"
  | "notification"
  | "audit_event";

type RetentionFileLinkType = "proposal" | "settlement" | "unattached";

type RetentionRecordSample = {
  type: RetentionRecordType;
  id: string;
  label: string;
  referenceDate: string;
};

type RetentionFileSample = {
  id: string;
  originalFilename: string;
  storageProvider: string;
  sizeBytes: number;
  sha256: string | null;
  createdAt: string;
  linkedType: RetentionFileLinkType;
};

export type RetentionReview = {
  householdId: string;
  generatedAt: string;
  deletionEnabled: false;
  operational: {
    retentionDays: number | null;
    cutoffDate: string | null;
    affectedRecordCount: number;
    proposalCount: number;
    commentCount: number;
    approvalCount: number;
    settlementCount: number;
    calendarEventCount: number;
    taskCount: number;
    notificationCount: number;
    auditEventCount: number;
    samples: RetentionRecordSample[];
  };
  attachments: {
    retentionDays: number | null;
    cutoffDate: string | null;
    affectedFileCount: number;
    affectedBytes: number;
    completedFileCount: number;
    pendingUploadCount: number;
    proposalFileCount: number;
    settlementFileCount: number;
    samples: RetentionFileSample[];
  };
};

type ReviewClock = {
  now?: Date;
};

function cutoffDate(retentionDays: number | null, now: Date) {
  if (retentionDays === null) {
    return null;
  }

  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

function dateWhere(cutoff: Date | null) {
  return cutoff ? { lt: cutoff } : undefined;
}

function iso(value: Date) {
  return value.toISOString();
}

function sumCounts(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function sortRecordSamples(samples: RetentionRecordSample[]) {
  return [...samples]
    .sort((left, right) => left.referenceDate.localeCompare(right.referenceDate))
    .slice(0, 5);
}

async function listOperationalSamples(householdId: string, cutoff: Date | null) {
  if (!cutoff) {
    return [];
  }

  const [
    proposals,
    comments,
    approvals,
    settlements,
    calendarEvents,
    tasks,
    notifications,
    auditEvents,
  ] = await Promise.all([
    prisma.expenseProposal.findMany({
      where: {
        householdId,
        createdAt: dateWhere(cutoff),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, createdAt: true },
      take: 3,
    }),
    prisma.proposalComment.findMany({
      where: {
        createdAt: dateWhere(cutoff),
        proposal: { householdId },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, createdAt: true },
      take: 2,
    }),
    prisma.proposalApproval.findMany({
      where: {
        createdAt: dateWhere(cutoff),
        proposal: { householdId },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, decision: true, createdAt: true },
      take: 2,
    }),
    prisma.settlement.findMany({
      where: {
        householdId,
        createdAt: dateWhere(cutoff),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, method: true, status: true, createdAt: true },
      take: 3,
    }),
    prisma.calendarEvent.findMany({
      where: {
        householdId,
        createdAt: dateWhere(cutoff),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, createdAt: true },
      take: 3,
    }),
    prisma.task.findMany({
      where: {
        householdId,
        createdAt: dateWhere(cutoff),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, createdAt: true },
      take: 3,
    }),
    prisma.notification.findMany({
      where: {
        householdId,
        createdAt: dateWhere(cutoff),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, createdAt: true },
      take: 2,
    }),
    prisma.auditEvent.findMany({
      where: {
        householdId,
        occurredAt: dateWhere(cutoff),
      },
      orderBy: { occurredAt: "asc" },
      select: { id: true, action: true, occurredAt: true },
      take: 3,
    }),
  ]);

  return sortRecordSamples([
    ...proposals.map((record) => ({
      type: "expense_proposal" as const,
      id: record.id,
      label: record.title,
      referenceDate: iso(record.createdAt),
    })),
    ...comments.map((record) => ({
      type: "proposal_comment" as const,
      id: record.id,
      label: record.body.slice(0, 80),
      referenceDate: iso(record.createdAt),
    })),
    ...approvals.map((record) => ({
      type: "proposal_approval" as const,
      id: record.id,
      label: record.decision,
      referenceDate: iso(record.createdAt),
    })),
    ...settlements.map((record) => ({
      type: "settlement" as const,
      id: record.id,
      label: `${record.method} ${record.status}`,
      referenceDate: iso(record.createdAt),
    })),
    ...calendarEvents.map((record) => ({
      type: "calendar_event" as const,
      id: record.id,
      label: record.title,
      referenceDate: iso(record.createdAt),
    })),
    ...tasks.map((record) => ({
      type: "task" as const,
      id: record.id,
      label: record.title,
      referenceDate: iso(record.createdAt),
    })),
    ...notifications.map((record) => ({
      type: "notification" as const,
      id: record.id,
      label: record.type,
      referenceDate: iso(record.createdAt),
    })),
    ...auditEvents.map((record) => ({
      type: "audit_event" as const,
      id: record.id,
      label: record.action,
      referenceDate: iso(record.occurredAt),
    })),
  ]);
}

function fileLinkType(file: {
  _count: { proposalFiles: number; settlementFiles: number };
}): RetentionFileLinkType {
  if (file._count.settlementFiles > 0) {
    return "settlement" satisfies RetentionFileLinkType;
  }

  if (file._count.proposalFiles > 0) {
    return "proposal" satisfies RetentionFileLinkType;
  }

  return "unattached" satisfies RetentionFileLinkType;
}

async function listAttachmentSamples(householdId: string, cutoff: Date | null) {
  if (!cutoff) {
    return [];
  }

  const files = await prisma.file.findMany({
    where: {
      householdId,
      createdAt: dateWhere(cutoff),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      originalFilename: true,
      storageProvider: true,
      sizeBytes: true,
      sha256: true,
      createdAt: true,
      _count: {
        select: {
          proposalFiles: true,
          settlementFiles: true,
        },
      },
    },
    take: 5,
  });

  return files.map((file) => ({
    id: file.id,
    originalFilename: file.originalFilename,
    storageProvider: file.storageProvider,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256 === pendingSha256 ? null : file.sha256,
    createdAt: iso(file.createdAt),
    linkedType: fileLinkType(file),
  }));
}

async function getOperationalCounts(householdId: string, cutoff: Date | null) {
  if (!cutoff) {
    return {
      proposalCount: 0,
      commentCount: 0,
      approvalCount: 0,
      settlementCount: 0,
      calendarEventCount: 0,
      taskCount: 0,
      notificationCount: 0,
      auditEventCount: 0,
    };
  }

  const createdBefore = dateWhere(cutoff);
  const [
    proposalCount,
    commentCount,
    approvalCount,
    settlementCount,
    calendarEventCount,
    taskCount,
    notificationCount,
    auditEventCount,
  ] = await Promise.all([
    prisma.expenseProposal.count({
      where: {
        householdId,
        createdAt: createdBefore,
      },
    }),
    prisma.proposalComment.count({
      where: {
        createdAt: createdBefore,
        proposal: { householdId },
      },
    }),
    prisma.proposalApproval.count({
      where: {
        createdAt: createdBefore,
        proposal: { householdId },
      },
    }),
    prisma.settlement.count({
      where: {
        householdId,
        createdAt: createdBefore,
      },
    }),
    prisma.calendarEvent.count({
      where: {
        householdId,
        createdAt: createdBefore,
      },
    }),
    prisma.task.count({
      where: {
        householdId,
        createdAt: createdBefore,
      },
    }),
    prisma.notification.count({
      where: {
        householdId,
        createdAt: createdBefore,
      },
    }),
    prisma.auditEvent.count({
      where: {
        householdId,
        occurredAt: createdBefore,
      },
    }),
  ]);

  return {
    proposalCount,
    commentCount,
    approvalCount,
    settlementCount,
    calendarEventCount,
    taskCount,
    notificationCount,
    auditEventCount,
  };
}

async function getAttachmentCounts(householdId: string, cutoff: Date | null) {
  if (!cutoff) {
    return {
      affectedFileCount: 0,
      affectedBytes: 0,
      completedFileCount: 0,
      pendingUploadCount: 0,
      proposalFileCount: 0,
      settlementFileCount: 0,
    };
  }

  const fileWhere: Prisma.FileWhereInput = {
    householdId,
    createdAt: dateWhere(cutoff),
  };
  const [
    affectedFileCount,
    affectedSize,
    completedFileCount,
    pendingUploadCount,
    proposalFileCount,
    settlementFileCount,
  ] = await Promise.all([
    prisma.file.count({ where: fileWhere }),
    prisma.file.aggregate({
      where: fileWhere,
      _sum: { sizeBytes: true },
    }),
    prisma.file.count({
      where: {
        ...fileWhere,
        sha256: {
          not: pendingSha256,
        },
      },
    }),
    prisma.file.count({
      where: {
        ...fileWhere,
        sha256: pendingSha256,
      },
    }),
    prisma.proposalFile.count({
      where: {
        file: fileWhere,
      },
    }),
    prisma.settlementFile.count({
      where: {
        file: fileWhere,
      },
    }),
  ]);

  return {
    affectedFileCount,
    affectedBytes: affectedSize._sum.sizeBytes ?? 0,
    completedFileCount,
    pendingUploadCount,
    proposalFileCount,
    settlementFileCount,
  };
}

export async function getRetentionReviewForHousehold(
  userId: string,
  householdId: string,
  clock: ReviewClock = {},
): Promise<RetentionReview> {
  const membership = await requireHouseholdSettingsManager(userId, householdId);
  const household = membership.household;
  const now = clock.now ?? new Date();
  const operationalCutoff = cutoffDate(household.operationalRetentionDays, now);
  const attachmentCutoff = cutoffDate(household.attachmentRetentionDays, now);
  const [operationalCounts, operationalSamples, attachmentCounts, attachmentSamples] =
    await Promise.all([
      getOperationalCounts(householdId, operationalCutoff),
      listOperationalSamples(householdId, operationalCutoff),
      getAttachmentCounts(householdId, attachmentCutoff),
      listAttachmentSamples(householdId, attachmentCutoff),
    ]);

  return {
    householdId,
    generatedAt: iso(now),
    deletionEnabled: false,
    operational: {
      retentionDays: household.operationalRetentionDays,
      cutoffDate: operationalCutoff ? iso(operationalCutoff) : null,
      affectedRecordCount: sumCounts(operationalCounts),
      ...operationalCounts,
      samples: operationalSamples,
    },
    attachments: {
      retentionDays: household.attachmentRetentionDays,
      cutoffDate: attachmentCutoff ? iso(attachmentCutoff) : null,
      ...attachmentCounts,
      samples: attachmentSamples,
    },
  };
}
