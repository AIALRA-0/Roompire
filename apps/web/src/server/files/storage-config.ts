import { ApiError } from "@/server/api/errors";

export type FileStorageProvider = "local" | "s3";

export type LocalFileStorageConfig = {
  provider: "local";
  bucket: null;
};

export type S3FileStorageConfig = {
  provider: "s3";
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type FileStorageConfig = LocalFileStorageConfig | S3FileStorageConfig;

type Env = Record<string, string | undefined>;

function requiredEnv(env: Env, key: string) {
  const value = env[key]?.trim();

  if (!value) {
    throw new ApiError(500, "FILE_STORAGE_CONFIG_INVALID", `${key} is required for S3 storage.`);
  }

  return value;
}

function boolEnv(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

export function resolveFileStorageConfig(env: Env = process.env): FileStorageConfig {
  const provider = (env.ROOMPIRE_FILE_STORAGE_PROVIDER ?? "local").trim().toLowerCase();

  if (!provider || provider === "local") {
    return {
      provider: "local",
      bucket: null,
    };
  }

  if (provider !== "s3") {
    throw new ApiError(
      500,
      "FILE_STORAGE_CONFIG_INVALID",
      `Unsupported ROOMPIRE_FILE_STORAGE_PROVIDER: ${provider}.`,
    );
  }

  return {
    provider: "s3",
    bucket: requiredEnv(env, "ROOMPIRE_S3_BUCKET"),
    region: requiredEnv(env, "ROOMPIRE_S3_REGION"),
    endpoint: env.ROOMPIRE_S3_ENDPOINT?.trim() || undefined,
    accessKeyId: env.ROOMPIRE_S3_ACCESS_KEY_ID?.trim() || requiredEnv(env, "AWS_ACCESS_KEY_ID"),
    secretAccessKey:
      env.ROOMPIRE_S3_SECRET_ACCESS_KEY?.trim() || requiredEnv(env, "AWS_SECRET_ACCESS_KEY"),
    forcePathStyle: boolEnv(env.ROOMPIRE_S3_FORCE_PATH_STYLE),
  };
}

export function storageProviderLabel(config: FileStorageConfig) {
  return config.provider;
}

export function storageBucketName(config: FileStorageConfig) {
  return config.provider === "s3" ? config.bucket : null;
}
