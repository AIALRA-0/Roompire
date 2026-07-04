import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { File as UploadedFile } from "@prisma/client";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { readLocalFileObject, writeLocalFileObject } from "@/server/files/local-storage";
import {
  assertDownloadToken,
  maxUploadBytes,
  pendingSha256,
  requireFileMutator,
} from "@/server/files/service";
import { resolveFileStorageConfig, type S3FileStorageConfig } from "./storage-config";

type PreparedUpload = {
  file: UploadedFile;
  bytes: Buffer;
  sha256: string;
};

let cachedS3ClientKey = "";
let cachedS3Client: S3Client | null = null;

function s3Client(config: S3FileStorageConfig) {
  const key = JSON.stringify({
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    forcePathStyle: config.forcePathStyle,
  });

  if (cachedS3Client && cachedS3ClientKey === key) {
    return cachedS3Client;
  }

  cachedS3ClientKey = key;
  cachedS3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedS3Client;
}

function s3ConfigForStoredFile(file: UploadedFile) {
  const config = resolveFileStorageConfig();

  if (config.provider !== "s3") {
    throw new ApiError(
      500,
      "FILE_STORAGE_CONFIG_MISMATCH",
      "Stored S3 file cannot be read while S3 storage is not configured.",
    );
  }

  return {
    ...config,
    bucket: file.bucket || config.bucket,
  };
}

async function bodyToBuffer(body: unknown) {
  if (!body) {
    throw new ApiError(502, "FILE_STORAGE_READ_FAILED", "Object storage returned no file body.");
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (
    typeof body === "object" &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks: Buffer[] = [];

  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function prepareUpload(
  userId: string,
  householdId: string,
  fileId: string,
  request: Request,
): Promise<PreparedUpload> {
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

  return {
    file,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function markUploaded(input: {
  householdId: string;
  userId: string;
  file: UploadedFile;
  bytes: Buffer;
  sha256: string;
}) {
  const updatedFile = await prisma.file.update({
    where: {
      id: input.file.id,
    },
    data: {
      sha256: input.sha256,
      sizeBytes: input.bytes.length,
    },
  });

  await prisma.auditEvent.create({
    data: {
      householdId: input.householdId,
      actorUserId: input.userId,
      action: "file.uploaded",
      entityType: "File",
      entityId: input.file.id,
      after: {
        originalFilename: input.file.originalFilename,
        mimeType: input.file.mimeType,
        sizeBytes: input.bytes.length,
        sha256: input.sha256,
        storageProvider: input.file.storageProvider,
      },
    },
  });

  return updatedFile;
}

async function putS3Object(file: UploadedFile, bytes: Buffer, sha256: string) {
  const config = s3ConfigForStoredFile(file);

  try {
    await s3Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: file.objectKey,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: file.mimeType,
        Metadata: {
          fileid: file.id,
          householdid: file.householdId,
          sha256,
        },
      }),
    );
  } catch {
    throw new ApiError(502, "FILE_STORAGE_WRITE_FAILED", "File object storage write failed.");
  }
}

async function getS3Object(file: UploadedFile) {
  const config = s3ConfigForStoredFile(file);

  try {
    const response = await s3Client(config).send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: file.objectKey,
      }),
    );

    return await bodyToBuffer(response.Body);
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "$metadata" in error &&
      (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
    ) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    throw new ApiError(502, "FILE_STORAGE_READ_FAILED", "File object storage read failed.");
  }
}

export async function storeFileUploadForHousehold(
  userId: string,
  householdId: string,
  fileId: string,
  request: Request,
) {
  const prepared = await prepareUpload(userId, householdId, fileId, request);

  if (prepared.file.storageProvider === "local") {
    await writeLocalFileObject(prepared.file.objectKey, prepared.bytes);
  } else if (prepared.file.storageProvider === "s3") {
    await putS3Object(prepared.file, prepared.bytes, prepared.sha256);
  } else {
    throw new ApiError(
      500,
      "FILE_STORAGE_CONFIG_INVALID",
      `Unsupported stored file provider: ${prepared.file.storageProvider}.`,
    );
  }

  return markUploaded({
    householdId,
    userId,
    file: prepared.file,
    bytes: prepared.bytes,
    sha256: prepared.sha256,
  });
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

  const bytes =
    file.storageProvider === "s3"
      ? await getS3Object(file)
      : await readLocalFileObject(file.objectKey);

  return {
    file,
    bytes,
  };
}
