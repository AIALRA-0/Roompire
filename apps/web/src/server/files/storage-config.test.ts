import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/api/errors";
import { resolveFileStorageConfig } from "./storage-config";

describe("file storage config", () => {
  it("defaults to local storage", () => {
    expect(resolveFileStorageConfig({})).toEqual({
      provider: "local",
      bucket: null,
    });
  });

  it("resolves S3-compatible storage from Roompire env vars", () => {
    expect(
      resolveFileStorageConfig({
        ROOMPIRE_FILE_STORAGE_PROVIDER: "s3",
        ROOMPIRE_S3_BUCKET: "roompire-files",
        ROOMPIRE_S3_REGION: "auto",
        ROOMPIRE_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
        ROOMPIRE_S3_ACCESS_KEY_ID: "key",
        ROOMPIRE_S3_SECRET_ACCESS_KEY: "secret",
        ROOMPIRE_S3_FORCE_PATH_STYLE: "true",
      }),
    ).toEqual({
      provider: "s3",
      bucket: "roompire-files",
      region: "auto",
      endpoint: "https://example.r2.cloudflarestorage.com",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true,
    });
  });

  it("falls back to AWS credential env vars", () => {
    expect(
      resolveFileStorageConfig({
        ROOMPIRE_FILE_STORAGE_PROVIDER: "s3",
        ROOMPIRE_S3_BUCKET: "roompire-files",
        ROOMPIRE_S3_REGION: "us-west-2",
        AWS_ACCESS_KEY_ID: "aws-key",
        AWS_SECRET_ACCESS_KEY: "aws-secret",
      }),
    ).toMatchObject({
      provider: "s3",
      accessKeyId: "aws-key",
      secretAccessKey: "aws-secret",
    });
  });

  it("rejects invalid providers and incomplete S3 config", () => {
    expect(() => resolveFileStorageConfig({ ROOMPIRE_FILE_STORAGE_PROVIDER: "ftp" })).toThrow(
      ApiError,
    );
    expect(() => resolveFileStorageConfig({ ROOMPIRE_FILE_STORAGE_PROVIDER: "s3" })).toThrow(
      ApiError,
    );
  });
});
