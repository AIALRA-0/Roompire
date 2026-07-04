import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/server/api/errors";

export function objectKeySegments(objectKey: string) {
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

export function localFilePath(objectKey: string) {
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    ".roompire_uploads",
    ...objectKeySegments(objectKey),
  );
}

export async function writeLocalFileObject(objectKey: string, bytes: Buffer) {
  const destination = localFilePath(objectKey);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

export async function readLocalFileObject(objectKey: string) {
  return readFile(localFilePath(objectKey));
}
