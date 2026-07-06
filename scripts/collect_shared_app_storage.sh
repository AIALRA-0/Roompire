#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const outputPath =
  process.env.ROOMPIRE_SHARED_APP_STORAGE_STATUS_FILE ||
  "ops/status/shared-app-storage.json";
const roots = String(process.env.ROOMPIRE_SHARED_APP_STORAGE_ROOTS || "/srv/aialra/apps")
  .split(/\s+/)
  .map((value) => value.trim())
  .filter(Boolean);
const topLimit = positiveInteger(process.env.ROOMPIRE_SHARED_APP_STORAGE_TOP_LIMIT, 12);
const totalTimeoutMs = positiveInteger(
  process.env.ROOMPIRE_SHARED_APP_STORAGE_TOTAL_TIMEOUT_MS,
  240000,
);
const pathTimeoutMs = positiveInteger(
  process.env.ROOMPIRE_SHARED_APP_STORAGE_PATH_TIMEOUT_MS,
  45000,
);
const generatedAt = new Date().toISOString();

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function duPath(targetPath) {
  const result = spawnSync("du", ["-x", "-s", "-B1", "--", targetPath], {
    encoding: "utf8",
    timeout: pathTimeoutMs,
  });

  if (result.error) {
    return { ok: false, timedOut: result.error.code === "ETIMEDOUT", error: result.error.message };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      timedOut: false,
      error: (result.stderr || result.stdout || `exit ${result.status}`).trim(),
    };
  }

  const firstLine = result.stdout.trim().split("\n").filter(Boolean)[0] || "";
  const separator = firstLine.indexOf("\t");
  const sizeText = separator === -1 ? firstLine.trim().split(/\s+/)[0] : firstLine.slice(0, separator);
  const sizeBytes = Number(sizeText);

  if (!Number.isFinite(sizeBytes)) {
    return { ok: false, timedOut: false, error: `Could not parse du output for ${targetPath}.` };
  }

  return { ok: true, timedOut: false, error: null, sizeBytes };
}

function listChildren(root) {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .map((entry) => path.join(root, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const absoluteRoots = roots.filter((root) => path.isAbsolute(root));
const rows = [];
const timedOutPaths = [];
const errors = [];
const startedAtMs = Date.now();
let stoppedEarly = false;

for (const root of absoluteRoots) {
  if (Date.now() - startedAtMs >= totalTimeoutMs) {
    stoppedEarly = true;
    break;
  }

  const children = listChildren(root);

  if (!Array.isArray(children)) {
    errors.push({ path: root, message: children.error });
    continue;
  }

  for (const child of children) {
    if (Date.now() - startedAtMs >= totalTimeoutMs) {
      stoppedEarly = true;
      break;
    }

    const result = duPath(child);

    if (result.ok) {
      rows.push({ path: child, sizeBytes: result.sizeBytes });
    } else if (result.timedOut) {
      timedOutPaths.push(child);
    } else {
      errors.push({ path: child, message: result.error });
    }
  }
}

const sortedRows = rows.sort((left, right) => right.sizeBytes - left.sizeBytes);
const totalBytes = rows.reduce((total, row) => total + row.sizeBytes, 0);
const status =
  absoluteRoots.length === 0 || (rows.length === 0 && (timedOutPaths.length > 0 || errors.length > 0))
    ? "unknown"
    : timedOutPaths.length > 0 || errors.length > 0 || stoppedEarly
      ? "warning"
      : "ok";
const error =
  absoluteRoots.length === 0
    ? "No absolute shared app storage roots are configured."
    : stoppedEarly
      ? "Shared app storage scan stopped at the total timeout."
      : null;

const snapshot = {
  schemaVersion: 1,
  generatedAt,
  roots: absoluteRoots,
  topLimit,
  totalTimeoutMs,
  pathTimeoutMs,
  totalBytes,
  paths: sortedRows.slice(0, topLimit),
  timedOutPaths,
  errors,
  status,
  checkedAt: generatedAt,
  error,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const tmpPath = `${outputPath}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, outputPath);
console.log(`ok ${outputPath}`);
NODE
