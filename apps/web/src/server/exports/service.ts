import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { serializeAuditEvent } from "@/server/audit/serializers";
import { listAllAuditEventsForHousehold } from "@/server/audit/service";
import { prisma } from "@/server/db/prisma";
import { serializeExpenseProposal } from "@/server/expenses/serializers";
import { serializeLedgerObligation } from "@/server/ledger/serializers";
import { listLedgerObligationsForHousehold } from "@/server/ledger/service";
import { requireActiveMembership } from "@/server/permissions/rbac";
import { serializeSettlement } from "@/server/settlements/serializers";
import { listSettlementsForHousehold } from "@/server/settlements/service";

export const exportDatasets = [
  "expense_proposals",
  "ledger_obligations",
  "settlements",
  "audit_events",
  "members",
] as const;
export const exportFormats = ["json", "csv"] as const;

export type ExportDataset = (typeof exportDatasets)[number];
export type ExportFormat = (typeof exportFormats)[number];

const exportRequestSchema = z.object({
  dataset: z.enum(exportDatasets),
  format: z.enum(exportFormats),
});

type ExportTokenPayload = {
  id: string;
  householdId: string;
  dataset: ExportDataset;
  format: ExportFormat;
  createdAt: string;
  exp: number;
};

type ExportRecord = Record<string, unknown>;

const exportTtlMs = 24 * 60 * 60 * 1000;

export function resolveExportSigningSecret(env: Record<string, string | undefined> = process.env) {
  const secret = env.ROOMPIRE_EXPORT_SIGNING_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (env.NODE_ENV === "production") {
    throw new ApiError(
      500,
      "EXPORT_SIGNING_CONFIG_INVALID",
      "ROOMPIRE_EXPORT_SIGNING_SECRET is required in production.",
    );
  }

  return "roompire-local-export-signing-secret";
}

function signingSecret() {
  return resolveExportSigningSecret();
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function createExportId(payload: ExportTokenPayload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));

  return `${encoded}.${signPayload(encoded)}`;
}

function assertExportId(exportId: string, householdId: string): ExportTokenPayload {
  const [payload, signature] = exportId.split(".");

  if (!payload || !signature) {
    throw new ApiError(403, "EXPORT_TOKEN_INVALID", "Export token is invalid.");
  }

  const expectedSignature = signPayload(payload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError(403, "EXPORT_TOKEN_INVALID", "Export token is invalid.");
  }

  let parsed: Partial<ExportTokenPayload>;

  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as Partial<ExportTokenPayload>;
  } catch {
    throw new ApiError(403, "EXPORT_TOKEN_INVALID", "Export token is invalid.");
  }

  if (
    typeof parsed.id !== "string" ||
    parsed.householdId !== householdId ||
    !exportDatasets.includes(parsed.dataset as ExportDataset) ||
    !exportFormats.includes(parsed.format as ExportFormat) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.exp !== "number" ||
    parsed.exp < Date.now()
  ) {
    throw new ApiError(403, "EXPORT_TOKEN_INVALID", "Export token is invalid or expired.");
  }

  return parsed as ExportTokenPayload;
}

function exportFilename(dataset: ExportDataset, format: ExportFormat, createdAt = new Date()) {
  const stamp = createdAt.toISOString().slice(0, 10);

  return `roompire-${dataset}-${stamp}.${format}`;
}

function responseContentType(format: ExportFormat) {
  return format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8";
}

function flattenRecord(value: unknown, prefix = "", output: ExportRecord = {}) {
  if (Array.isArray(value)) {
    output[prefix] = JSON.stringify(value);
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      flattenRecord(nestedValue, prefix ? `${prefix}.${key}` : key, output);
    }

    return output;
  }

  output[prefix] = value;
  return output;
}

function csvValue(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function recordsToCsv(records: ExportRecord[]) {
  const flattened = records.map((record) => flattenRecord(record));
  const headers = [...new Set(flattened.flatMap((record) => Object.keys(record)))].sort();

  if (headers.length === 0) {
    return "";
  }

  return [
    headers.map(csvValue).join(","),
    ...flattened.map((record) => headers.map((header) => csvValue(record[header])).join(",")),
  ].join("\n");
}

async function exportExpenseProposals(householdId: string) {
  const proposals = await prisma.expenseProposal.findMany({
    where: { householdId },
    include: {
      category: true,
      payers: true,
      shares: true,
      approvals: true,
      comments: true,
      proposalFiles: {
        include: {
          file: true,
        },
      },
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });

  return proposals.map(serializeExpenseProposal);
}

async function exportMembers(householdId: string) {
  const memberships = await prisma.householdMembership.findMany({
    where: { householdId },
    include: { user: true },
    orderBy: [{ status: "asc" }, { role: "asc" }, { createdAt: "asc" }],
  });

  return memberships.map((membership) => ({
    id: membership.id,
    householdId: membership.householdId,
    userId: membership.userId,
    email: membership.user.email,
    displayName: membership.displayNameOverride ?? membership.user.displayName,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt?.toISOString() ?? null,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  }));
}

async function exportRecords(userId: string, householdId: string, dataset: ExportDataset) {
  if (dataset === "expense_proposals") {
    return exportExpenseProposals(householdId);
  }

  if (dataset === "ledger_obligations") {
    return (await listLedgerObligationsForHousehold(userId, householdId)).map(
      serializeLedgerObligation,
    );
  }

  if (dataset === "settlements") {
    return (await listSettlementsForHousehold(userId, householdId)).map(serializeSettlement);
  }

  if (dataset === "audit_events") {
    return (await listAllAuditEventsForHousehold(userId, householdId)).map(serializeAuditEvent);
  }

  return exportMembers(householdId);
}

export async function createHouseholdExportForUser(
  userId: string,
  householdId: string,
  input: unknown,
) {
  const parsed = exportRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Export input is invalid.", parsed.error.flatten());
  }

  await requireActiveMembership(userId, householdId);
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + exportTtlMs);
  const exportId = createExportId({
    id,
    householdId,
    dataset: parsed.data.dataset,
    format: parsed.data.format,
    createdAt: createdAt.toISOString(),
    exp: expiresAt.getTime(),
  });

  await prisma.auditEvent.create({
    data: {
      householdId,
      actorUserId: userId,
      action: "export.created",
      entityType: "Export",
      entityId: id,
      after: {
        dataset: parsed.data.dataset,
        format: parsed.data.format,
      },
      metadata: {
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  return {
    id: exportId,
    householdId,
    dataset: parsed.data.dataset,
    format: parsed.data.format,
    status: "READY" as const,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    downloadUrl: `/api/v1/households/${householdId}/exports/${encodeURIComponent(exportId)}`,
  };
}

export async function createHouseholdExportDownload(
  userId: string,
  householdId: string,
  exportId: string,
) {
  await requireActiveMembership(userId, householdId);
  const payload = assertExportId(exportId, householdId);
  const records = await exportRecords(userId, householdId, payload.dataset);
  const createdAt = new Date(payload.createdAt);
  const filename = exportFilename(payload.dataset, payload.format, createdAt);

  if (payload.format === "csv") {
    return {
      body: recordsToCsv(records),
      filename,
      contentType: responseContentType(payload.format),
    };
  }

  return {
    body: JSON.stringify(
      {
        dataset: payload.dataset,
        householdId,
        exportId: payload.id,
        exportedAt: new Date().toISOString(),
        records,
      },
      null,
      2,
    ),
    filename,
    contentType: responseContentType(payload.format),
  };
}
