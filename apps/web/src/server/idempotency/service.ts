import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

type IdempotentMutationInput<TBody extends Record<string, unknown>> = {
  key: string;
  userId: string;
  householdId?: string;
  method: string;
  routeKey: string;
  requestBody: unknown;
  handler: () => Promise<{
    status: number;
    body: TBody;
  }>;
};

export function requireIdempotencyKey(value: string | null | undefined, action: string) {
  const key = value?.trim();

  if (!key) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      `Idempotency-Key header is required for ${action}.`,
    );
  }

  if (key.length > 160 || /[\u0000-\u001F\u007F]/.test(key)) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_INVALID",
      "Idempotency-Key must be 160 characters or fewer and cannot contain control characters.",
    );
  }

  return key;
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined,
    );

    return `{${entries
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function requestHash(method: string, routeKey: string, requestBody: unknown) {
  return createHash("sha256")
    .update(stableStringify({ method, requestBody, routeKey }))
    .digest("hex");
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function loadExistingRecord(userId: string, key: string) {
  return prisma.idempotencyRecord.findUnique({
    where: {
      userId_key: {
        userId,
        key,
      },
    },
  });
}

function assertReusableRecord(
  record: Awaited<ReturnType<typeof loadExistingRecord>>,
  expected: {
    method: string;
    routeKey: string;
    requestHash: string;
  },
) {
  if (!record) {
    throw new ApiError(409, "IDEMPOTENCY_RECORD_MISSING", "Idempotency record is missing.");
  }

  if (
    record.method !== expected.method ||
    record.routeKey !== expected.routeKey ||
    record.requestHash !== expected.requestHash
  ) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency-Key has already been used for a different request.",
    );
  }

  if (record.status !== "COMPLETED" || record.responseStatusCode === null || !record.responseBody) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "A request with this Idempotency-Key is still in progress.",
    );
  }

  return {
    status: record.responseStatusCode,
    body: record.responseBody as Record<string, unknown>,
  };
}

export async function runIdempotentMutation<TBody extends Record<string, unknown>>({
  key,
  userId,
  householdId,
  method,
  routeKey,
  requestBody,
  handler,
}: IdempotentMutationInput<TBody>) {
  const hash = requestHash(method, routeKey, requestBody);

  try {
    await prisma.idempotencyRecord.create({
      data: {
        key,
        userId,
        householdId,
        method,
        routeKey,
        requestHash: hash,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existing = await loadExistingRecord(userId, key);

    return assertReusableRecord(existing, {
      method,
      routeKey,
      requestHash: hash,
    });
  }

  try {
    const response = await handler();

    await prisma.idempotencyRecord.update({
      where: {
        userId_key: {
          userId,
          key,
        },
      },
      data: {
        status: "COMPLETED",
        responseStatusCode: response.status,
        responseBody: response.body as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    return response;
  } catch (error) {
    await prisma.idempotencyRecord.deleteMany({
      where: {
        userId,
        key,
        status: "IN_PROGRESS",
      },
    });

    throw error;
  }
}
