import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { File as UploadedFile, Role } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership } from "@/server/permissions/rbac";
import {
  resolveFileStorageConfig,
  storageBucketName,
  storageProviderLabel,
} from "./storage-config";

export const maxUploadBytes = 5 * 1024 * 1024;
export const pendingSha256 = "pending";
const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const proposalFilePurposes = ["receipt", "evidence", "other"] as const;

const createFileUploadIntentSchema = z.object({
  originalFilename: z.string().trim().min(1).max(180),
  mimeType: z.enum(allowedMimeTypes),
  sizeBytes: z.number().int().positive().max(maxUploadBytes),
});

export const completeFileUploadSchema = z.object({
  fileId: z.string().uuid(),
  proposalId: z.string().uuid().optional(),
  purpose: z.enum(proposalFilePurposes).default("receipt"),
});

function canMutateFiles(role: Role) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

export async function requireFileMutator(userId: string, householdId: string) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!canMutateFiles(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot upload household files.");
  }

  return membership;
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function signingSecret() {
  return (
    process.env.ROOMPIRE_FILE_SIGNING_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "roompire-local-file-signing-secret"
  );
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

export function assertDownloadToken(input: { householdId: string; fileId: string; token: string }) {
  const [payload, signature] = input.token.split(".");

  if (!payload || !signature) {
    throw new ApiError(403, "FILE_TOKEN_INVALID", "File download token is invalid.");
  }

  const expectedSignature = signPayload(payload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError(403, "FILE_TOKEN_INVALID", "File download token is invalid.");
  }

  let parsed: { householdId?: string; fileId?: string; exp?: number };

  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as typeof parsed;
  } catch {
    throw new ApiError(403, "FILE_TOKEN_INVALID", "File download token is invalid.");
  }

  if (
    parsed.householdId !== input.householdId ||
    parsed.fileId !== input.fileId ||
    typeof parsed.exp !== "number" ||
    parsed.exp < Date.now()
  ) {
    throw new ApiError(403, "FILE_TOKEN_INVALID", "File download token is invalid or expired.");
  }
}

export function createFileDownloadPath(
  householdId: string,
  fileId: string,
  expiresAt = new Date(Date.now() + 5 * 60 * 1000),
) {
  const payload = base64UrlEncode(
    JSON.stringify({
      householdId,
      fileId,
      exp: expiresAt.getTime(),
    }),
  );
  const token = `${payload}.${signPayload(payload)}`;

  return {
    downloadUrl: `/api/v1/households/${householdId}/files/${fileId}/download?token=${encodeURIComponent(token)}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export function serializeFile(file: UploadedFile) {
  return {
    id: file.id,
    householdId: file.householdId,
    uploadedByUserId: file.uploadedByUserId,
    storageProvider: file.storageProvider,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256 === pendingSha256 ? null : file.sha256,
    createdAt: file.createdAt.toISOString(),
  };
}

export async function createFileUploadIntentForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  await requireFileMutator(userId, householdId);
  const parsed = createFileUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("File upload input is invalid.", parsed.error.flatten());
  }

  const safeName = sanitizeFilename(parsed.data.originalFilename) || "upload";
  const objectKey = `${householdId}/${randomUUID()}-${safeName}`;
  const storageConfig = resolveFileStorageConfig();

  const file = await prisma.file.create({
    data: {
      householdId,
      uploadedByUserId: userId,
      storageProvider: storageProviderLabel(storageConfig),
      bucket: storageBucketName(storageConfig),
      objectKey,
      originalFilename: parsed.data.originalFilename,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      sha256: pendingSha256,
    },
  });

  return file;
}

export async function completeFileUploadForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  await requireFileMutator(userId, householdId);
  const parsed = completeFileUploadSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("File completion input is invalid.", parsed.error.flatten());
  }

  const file = await prisma.file.findFirst({
    where: {
      id: parsed.data.fileId,
      householdId,
    },
  });

  if (!file) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  if (file.uploadedByUserId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "Only the uploader can complete this file.");
  }

  if (file.sha256 === pendingSha256) {
    throw new ApiError(409, "FILE_UPLOAD_INCOMPLETE", "File bytes have not been uploaded yet.");
  }

  if (!parsed.data.proposalId) {
    return file;
  }

  const proposal = await prisma.expenseProposal.findFirst({
    where: {
      id: parsed.data.proposalId,
      householdId,
    },
  });

  if (!proposal) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposalFile.upsert({
      where: {
        proposalId_fileId: {
          proposalId: proposal.id,
          fileId: file.id,
        },
      },
      update: {
        purpose: parsed.data.purpose,
      },
      create: {
        proposalId: proposal.id,
        fileId: file.id,
        purpose: parsed.data.purpose,
        createdByUserId: userId,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_proposal.file_attached",
        entityType: "ProposalFile",
        entityId: proposal.id,
        after: {
          proposalId: proposal.id,
          fileId: file.id,
          purpose: parsed.data.purpose,
        },
      },
    });
  });

  return file;
}

export async function assertFilesReadyForProposal(input: {
  userId: string;
  householdId: string;
  fileIds: string[];
}) {
  if (input.fileIds.length === 0) {
    return;
  }

  const uniqueFileIds = [...new Set(input.fileIds)];

  if (uniqueFileIds.length !== input.fileIds.length) {
    throw new ApiError(400, "DUPLICATE_FILE", "Each file can be attached only once.");
  }

  const files = await prisma.file.findMany({
    where: {
      id: {
        in: input.fileIds,
      },
      householdId: input.householdId,
    },
  });
  const filesById = new Map(files.map((file) => [file.id, file]));

  for (const fileId of input.fileIds) {
    const file = filesById.get(fileId);

    if (!file) {
      throw new ApiError(400, "INVALID_FILE", "Attached file is not available.");
    }

    if (file.uploadedByUserId !== input.userId) {
      throw new ApiError(403, "FORBIDDEN", "Only the uploader can attach this file.");
    }

    if (file.sha256 === pendingSha256) {
      throw new ApiError(409, "FILE_UPLOAD_INCOMPLETE", "Attached file has not finished upload.");
    }
  }
}

export async function createDownloadUrlForFile(
  userId: string,
  householdId: string,
  fileId: string,
) {
  await requireActiveMembership(userId, householdId);
  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      householdId,
    },
  });

  if (!file || file.sha256 === pendingSha256) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  return {
    file,
    ...createFileDownloadPath(householdId, file.id),
  };
}
