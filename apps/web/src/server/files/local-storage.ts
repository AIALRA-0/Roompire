import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import {
  assertDownloadToken,
  maxUploadBytes,
  pendingSha256,
  requireFileMutator,
} from "@/server/files/service";

function objectKeySegments(objectKey: string) {
  const segments = objectKey.split("/");

  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\") ||
        path.isAbsolute(segment),
    )
  ) {
    throw new ApiError(400, "INVALID_OBJECT_KEY", "Stored file object key is invalid.");
  }

  return segments;
}

function localFilePath(objectKey: string) {
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    ".roompire_uploads",
    ...objectKeySegments(objectKey),
  );
}

export async function storeLocalFileUploadForHousehold(
  userId: string,
  householdId: string,
  fileId: string,
  request: Request,
) {
  await requireFileMutator(userId, householdId);
  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      householdId,
    },
  });

  if (!file) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  if (file.uploadedByUserId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "Only the uploader can write this file.");
  }

  const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";

  if (contentType !== file.mimeType) {
    throw new ApiError(400, "FILE_MIME_TYPE_MISMATCH", "Uploaded file MIME type changed.");
  }

  const bytes = Buffer.from(await request.arrayBuffer());

  if (bytes.length <= 0 || bytes.length > maxUploadBytes) {
    throw new ApiError(400, "FILE_SIZE_INVALID", "Uploaded file size is invalid.");
  }

  if (bytes.length !== file.sizeBytes) {
    throw new ApiError(400, "FILE_SIZE_MISMATCH", "Uploaded file size changed.");
  }

  const destination = localFilePath(file.objectKey);

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const updatedFile = await prisma.file.update({
    where: {
      id: file.id,
    },
    data: {
      sha256,
      sizeBytes: bytes.length,
    },
  });

  await prisma.auditEvent.create({
    data: {
      householdId,
      actorUserId: userId,
      action: "file.uploaded",
      entityType: "File",
      entityId: file.id,
      after: {
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        sizeBytes: bytes.length,
        sha256,
      },
    },
  });

  return updatedFile;
}

export async function readFileForSignedDownload(input: {
  householdId: string;
  fileId: string;
  token: string;
}) {
  assertDownloadToken(input);

  const file = await prisma.file.findFirst({
    where: {
      id: input.fileId,
      householdId: input.householdId,
    },
  });

  if (!file || file.sha256 === pendingSha256) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  return {
    file,
    bytes: await readFile(localFilePath(file.objectKey)),
  };
}
