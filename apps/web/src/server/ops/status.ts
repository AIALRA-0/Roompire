import { readFile, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import type { User } from "@prisma/client";
import { ApiError } from "@/server/api/errors";
import { resolveConfiguredSiteGateSessionEmail } from "@/server/auth/site-gate";
import { prisma } from "@/server/db/prisma";

type HealthState = "ok" | "warning" | "unknown";
type SmokeState = "passed" | "failed" | "missing" | "unknown";
type BackupEncryptionMode = "enabled" | "disabled" | "unknown";
type BackupOffsiteMode = "disabled" | "local" | "rclone" | "unknown";

export type OpsSmokeCheck = {
  path: string;
  status: "passed" | "failed";
  httpStatus: number | null;
  message: string | null;
};

export type OpsSmokeStatus = {
  status: SmokeState;
  generatedAt: string | null;
  baseUrl: string | null;
  checks: OpsSmokeCheck[];
  failedPath: string | null;
  message: string | null;
};

export type OpsStatusSnapshot = {
  schemaVersion: 1;
  source: "host_status_file" | "runtime_fallback";
  generatedAt: string;
  summary: {
    status: HealthState;
    warnings: string[];
  };
  statusFile: {
    path: string | null;
    loaded: boolean;
    error: string | null;
  };
  disk: {
    path: string;
    sizeBytes: number | null;
    usedBytes: number | null;
    availableBytes: number | null;
    usedPercent: number | null;
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  dockerStorage: {
    images: OpsDockerStorageCategory;
    containers: OpsDockerStorageCategory;
    localVolumes: OpsDockerStorageCategory;
    buildCache: OpsDockerStorageCategory;
    totalReclaimableBytes: number;
    reclaimableWarningBytes: number;
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  backupTimer: {
    name: string;
    activeState: string;
    enabledState: string;
    nextElapse: string | null;
    lastTrigger: string | null;
    status: HealthState;
    error: string | null;
  };
  backupService: {
    name: string;
    activeState: string;
    result: string;
    execMainStatus: string;
    startedAt: string | null;
    finishedAt: string | null;
    status: HealthState;
    error: string | null;
  };
  housekeepingTimer: {
    name: string;
    activeState: string;
    enabledState: string;
    nextElapse: string | null;
    lastTrigger: string | null;
    status: HealthState;
    error: string | null;
  };
  housekeepingService: {
    name: string;
    activeState: string;
    result: string;
    execMainStatus: string;
    startedAt: string | null;
    finishedAt: string | null;
    status: HealthState;
    error: string | null;
  };
  backupEncryption: {
    backupRoot: string;
    configured: BackupEncryptionMode;
    passphraseFileConfigured: boolean;
    passphraseFileExists: boolean | null;
    encryptedArtifacts: number;
    plaintextArtifacts: number;
    missingSha256Sidecars: number;
    latestEncryptedArtifact: string | null;
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  backupOffsite: {
    mode: BackupOffsiteMode;
    configured: boolean;
    targetConfigured: boolean;
    target: string | null;
    statusFile: string;
    lastSyncAt: string | null;
    artifactCount: number;
    totalBytes: number;
    latestArtifact: string | null;
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  latestSmoke: OpsSmokeStatus;
};

export type OpsDockerStorageCategory = {
  totalCount: number;
  activeCount: number;
  sizeBytes: number;
  reclaimableBytes: number;
  reclaimablePercent: number | null;
};

const diskWarningAvailableBytes = 5 * 1024 * 1024 * 1024;
const dockerReclaimableWarningBytes = 5 * 1024 * 1024 * 1024;
const staleStatusMs = 36 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function healthStateValue(value: unknown): HealthState {
  return value === "ok" || value === "warning" || value === "unknown" ? value : "unknown";
}

function smokeStateValue(value: unknown): SmokeState {
  return value === "passed" || value === "failed" || value === "missing" || value === "unknown"
    ? value
    : "unknown";
}

function backupEncryptionModeValue(value: unknown): BackupEncryptionMode {
  return value === "enabled" || value === "disabled" || value === "unknown" ? value : "unknown";
}

function backupOffsiteModeValue(value: unknown): BackupOffsiteMode {
  return value === "disabled" || value === "local" || value === "rclone" || value === "unknown"
    ? value
    : "unknown";
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function nullableBooleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeDockerStorageCategory(value: unknown): OpsDockerStorageCategory {
  if (!isRecord(value)) {
    return {
      totalCount: 0,
      activeCount: 0,
      sizeBytes: 0,
      reclaimableBytes: 0,
      reclaimablePercent: null,
    };
  }

  return {
    totalCount: numberValue(value.totalCount) ?? 0,
    activeCount: numberValue(value.activeCount) ?? 0,
    sizeBytes: numberValue(value.sizeBytes) ?? 0,
    reclaimableBytes: numberValue(value.reclaimableBytes) ?? 0,
    reclaimablePercent: numberValue(value.reclaimablePercent),
  };
}

function resolveStatusFileCandidates() {
  const configured = process.env.ROOMPIRE_OPS_STATUS_FILE?.trim();

  if (configured) {
    return [resolve(configured)];
  }

  const relativePath = "ops/status/ops-status.json";
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), "..", "..", relativePath),
    resolve("/app", relativePath),
  ];

  return [...new Set(candidates)];
}

async function readConfiguredStatusFile() {
  const candidates = resolveStatusFileCandidates();
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return {
        path: candidate,
        text: await readFile(candidate, "utf8"),
      };
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") {
        continue;
      }

      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    path: candidates[0] ?? null,
    text: null,
    error: errors.join("; ") || "Ops status file is not available.",
  };
}

function normalizeSmokeCheck(value: unknown): OpsSmokeCheck | null {
  if (!isRecord(value)) {
    return null;
  }

  const path = stringValue(value.path);

  if (!path) {
    return null;
  }

  const status = value.status === "failed" ? "failed" : "passed";

  return {
    path,
    status,
    httpStatus: numberValue(value.httpStatus),
    message: nullableStringValue(value.message),
  };
}

function normalizeSmoke(value: unknown): OpsSmokeStatus {
  if (!isRecord(value)) {
    return {
      status: "missing",
      generatedAt: null,
      baseUrl: null,
      checks: [],
      failedPath: null,
      message: "No smoke-test status has been recorded yet.",
    };
  }

  return {
    status: smokeStateValue(value.status),
    generatedAt: nullableStringValue(value.generatedAt),
    baseUrl: nullableStringValue(value.baseUrl),
    checks: Array.isArray(value.checks)
      ? value.checks.map(normalizeSmokeCheck).filter((check) => check !== null)
      : [],
    failedPath: nullableStringValue(value.failedPath),
    message: nullableStringValue(value.message),
  };
}

function diskStatusFromValues(
  availableBytes: number | null,
  usedPercent: number | null,
): HealthState {
  if (availableBytes === null && usedPercent === null) {
    return "unknown" satisfies HealthState;
  }

  if (
    (availableBytes !== null && availableBytes < diskWarningAvailableBytes) ||
    (usedPercent !== null && usedPercent >= 90)
  ) {
    return "warning" satisfies HealthState;
  }

  return "ok" satisfies HealthState;
}

function deriveWarnings(status: Omit<OpsStatusSnapshot, "summary">) {
  const warnings: string[] = [];
  const generatedAtTime = Date.parse(status.generatedAt);

  if (!status.statusFile.loaded) {
    warnings.push("status_file_missing");
  }

  if (Number.isFinite(generatedAtTime) && Date.now() - generatedAtTime > staleStatusMs) {
    warnings.push("status_stale");
  }

  if (
    status.disk.availableBytes !== null &&
    status.disk.availableBytes < diskWarningAvailableBytes
  ) {
    warnings.push("disk_low");
  }

  if (status.disk.usedPercent !== null && status.disk.usedPercent >= 90) {
    warnings.push("disk_high_usage");
  }

  if (status.disk.status === "unknown") {
    warnings.push("disk_unknown");
  }

  if (status.dockerStorage.status === "unknown") {
    warnings.push("docker_storage_unknown");
  }

  if (status.dockerStorage.status === "warning") {
    warnings.push("docker_reclaimable_high");
  }

  if (status.backupTimer.status !== "ok") {
    warnings.push("backup_timer_attention");
  }

  if (status.backupService.status === "warning") {
    warnings.push("backup_service_attention");
  }

  if (status.housekeepingTimer.status !== "ok") {
    warnings.push("housekeeping_timer_attention");
  }

  if (status.housekeepingService.status === "warning") {
    warnings.push("housekeeping_service_attention");
  }

  if (status.backupEncryption.configured !== "enabled") {
    warnings.push("backup_encryption_disabled");
  }

  if (status.backupEncryption.encryptedArtifacts === 0) {
    warnings.push("backup_encryption_missing_artifacts");
  }

  if (status.backupEncryption.plaintextArtifacts > 0) {
    warnings.push("backup_plaintext_artifacts");
  }

  if (status.backupEncryption.missingSha256Sidecars > 0) {
    warnings.push("backup_encryption_sidecar_missing");
  }

  if (
    status.backupEncryption.passphraseFileConfigured &&
    status.backupEncryption.passphraseFileExists === false
  ) {
    warnings.push("backup_passphrase_missing");
  }

  if (status.backupEncryption.status === "unknown") {
    warnings.push("backup_encryption_unknown");
  }

  if (!status.backupOffsite.configured || status.backupOffsite.mode === "disabled") {
    warnings.push("backup_offsite_disabled");
  } else if (status.backupOffsite.status !== "ok") {
    warnings.push("backup_offsite_attention");
  }

  if (status.latestSmoke.status === "failed") {
    warnings.push("smoke_failed");
  }

  if (status.latestSmoke.status === "missing" || status.latestSmoke.status === "unknown") {
    warnings.push("smoke_missing");
  }

  return warnings;
}

function normalizeLoadedStatus(parsed: unknown, filePath: string): OpsStatusSnapshot {
  const raw = isRecord(parsed) ? parsed : {};
  const rawDisk = isRecord(raw.disk) ? raw.disk : {};
  const rawBackupTimer = isRecord(raw.backupTimer) ? raw.backupTimer : {};
  const rawBackupService = isRecord(raw.backupService) ? raw.backupService : {};
  const rawDockerStorage = isRecord(raw.dockerStorage) ? raw.dockerStorage : {};
  const rawHousekeepingTimer = isRecord(raw.housekeepingTimer) ? raw.housekeepingTimer : {};
  const rawHousekeepingService = isRecord(raw.housekeepingService) ? raw.housekeepingService : {};
  const rawBackupEncryption = isRecord(raw.backupEncryption) ? raw.backupEncryption : {};
  const rawBackupOffsite = isRecord(raw.backupOffsite) ? raw.backupOffsite : {};
  const availableBytes = numberValue(rawDisk.availableBytes);
  const usedPercent = numberValue(rawDisk.usedPercent);
  const diskStatus = healthStateValue(rawDisk.status);
  const partial: Omit<OpsStatusSnapshot, "summary"> = {
    schemaVersion: 1 as const,
    source: "host_status_file" as const,
    generatedAt: nullableStringValue(raw.generatedAt) ?? new Date().toISOString(),
    statusFile: {
      path: filePath,
      loaded: true,
      error: null,
    },
    disk: {
      path: stringValue(rawDisk.path, "/"),
      sizeBytes: numberValue(rawDisk.sizeBytes),
      usedBytes: numberValue(rawDisk.usedBytes),
      availableBytes,
      usedPercent,
      status:
        diskStatus === "unknown" ? diskStatusFromValues(availableBytes, usedPercent) : diskStatus,
      checkedAt: nullableStringValue(rawDisk.checkedAt),
      error: nullableStringValue(rawDisk.error),
    },
    dockerStorage: {
      images: normalizeDockerStorageCategory(rawDockerStorage.images),
      containers: normalizeDockerStorageCategory(rawDockerStorage.containers),
      localVolumes: normalizeDockerStorageCategory(rawDockerStorage.localVolumes),
      buildCache: normalizeDockerStorageCategory(rawDockerStorage.buildCache),
      totalReclaimableBytes: numberValue(rawDockerStorage.totalReclaimableBytes) ?? 0,
      reclaimableWarningBytes:
        numberValue(rawDockerStorage.reclaimableWarningBytes) ?? dockerReclaimableWarningBytes,
      status: healthStateValue(rawDockerStorage.status),
      checkedAt: nullableStringValue(rawDockerStorage.checkedAt),
      error: nullableStringValue(rawDockerStorage.error),
    },
    backupTimer: {
      name: stringValue(rawBackupTimer.name, "roompire-backup.timer"),
      activeState: stringValue(rawBackupTimer.activeState, "unknown"),
      enabledState: stringValue(rawBackupTimer.enabledState, "unknown"),
      nextElapse: nullableStringValue(rawBackupTimer.nextElapse),
      lastTrigger: nullableStringValue(rawBackupTimer.lastTrigger),
      status: healthStateValue(rawBackupTimer.status),
      error: nullableStringValue(rawBackupTimer.error),
    },
    backupService: {
      name: stringValue(rawBackupService.name, "roompire-backup.service"),
      activeState: stringValue(rawBackupService.activeState, "unknown"),
      result: stringValue(rawBackupService.result, "unknown"),
      execMainStatus: stringValue(rawBackupService.execMainStatus, "unknown"),
      startedAt: nullableStringValue(rawBackupService.startedAt),
      finishedAt: nullableStringValue(rawBackupService.finishedAt),
      status: healthStateValue(rawBackupService.status),
      error: nullableStringValue(rawBackupService.error),
    },
    housekeepingTimer: {
      name: stringValue(rawHousekeepingTimer.name, "roompire-housekeeping.timer"),
      activeState: stringValue(rawHousekeepingTimer.activeState, "unknown"),
      enabledState: stringValue(rawHousekeepingTimer.enabledState, "unknown"),
      nextElapse: nullableStringValue(rawHousekeepingTimer.nextElapse),
      lastTrigger: nullableStringValue(rawHousekeepingTimer.lastTrigger),
      status: healthStateValue(rawHousekeepingTimer.status),
      error: nullableStringValue(rawHousekeepingTimer.error),
    },
    housekeepingService: {
      name: stringValue(rawHousekeepingService.name, "roompire-housekeeping.service"),
      activeState: stringValue(rawHousekeepingService.activeState, "unknown"),
      result: stringValue(rawHousekeepingService.result, "unknown"),
      execMainStatus: stringValue(rawHousekeepingService.execMainStatus, "unknown"),
      startedAt: nullableStringValue(rawHousekeepingService.startedAt),
      finishedAt: nullableStringValue(rawHousekeepingService.finishedAt),
      status: healthStateValue(rawHousekeepingService.status),
      error: nullableStringValue(rawHousekeepingService.error),
    },
    backupEncryption: {
      backupRoot: stringValue(rawBackupEncryption.backupRoot, "/srv/aialra/backups/roompire"),
      configured: backupEncryptionModeValue(rawBackupEncryption.configured),
      passphraseFileConfigured: booleanValue(rawBackupEncryption.passphraseFileConfigured),
      passphraseFileExists: nullableBooleanValue(rawBackupEncryption.passphraseFileExists),
      encryptedArtifacts: numberValue(rawBackupEncryption.encryptedArtifacts) ?? 0,
      plaintextArtifacts: numberValue(rawBackupEncryption.plaintextArtifacts) ?? 0,
      missingSha256Sidecars: numberValue(rawBackupEncryption.missingSha256Sidecars) ?? 0,
      latestEncryptedArtifact: nullableStringValue(rawBackupEncryption.latestEncryptedArtifact),
      status: healthStateValue(rawBackupEncryption.status),
      checkedAt: nullableStringValue(rawBackupEncryption.checkedAt),
      error: nullableStringValue(rawBackupEncryption.error),
    },
    backupOffsite: {
      mode: backupOffsiteModeValue(rawBackupOffsite.mode),
      configured: booleanValue(rawBackupOffsite.configured),
      targetConfigured: booleanValue(rawBackupOffsite.targetConfigured),
      target: nullableStringValue(rawBackupOffsite.target),
      statusFile: stringValue(rawBackupOffsite.statusFile, "ops/status/backup-offsite.json"),
      lastSyncAt: nullableStringValue(rawBackupOffsite.lastSyncAt),
      artifactCount: numberValue(rawBackupOffsite.artifactCount) ?? 0,
      totalBytes: numberValue(rawBackupOffsite.totalBytes) ?? 0,
      latestArtifact: nullableStringValue(rawBackupOffsite.latestArtifact),
      status: healthStateValue(rawBackupOffsite.status),
      checkedAt: nullableStringValue(rawBackupOffsite.checkedAt),
      error: nullableStringValue(rawBackupOffsite.error),
    },
    latestSmoke: normalizeSmoke(raw.latestSmoke),
  };
  const warnings = deriveWarnings(partial);

  return {
    ...partial,
    summary: {
      status: warnings.length > 0 ? "warning" : "ok",
      warnings,
    },
  };
}

async function runtimeFallbackStatus(statusFilePath: string | null, error: string | null) {
  const diskPath = process.env.ROOMPIRE_OPS_DISK_PATH?.trim() || "/";
  let disk: OpsStatusSnapshot["disk"];

  try {
    const stats = await statfs(diskPath);
    const sizeBytes = stats.blocks * stats.bsize;
    const availableBytes = stats.bavail * stats.bsize;
    const usedBytes = sizeBytes - availableBytes;
    const usedPercent = sizeBytes > 0 ? Math.round((usedBytes / sizeBytes) * 1000) / 10 : null;

    disk = {
      path: diskPath,
      sizeBytes,
      usedBytes,
      availableBytes,
      usedPercent,
      status: diskStatusFromValues(availableBytes, usedPercent),
      checkedAt: new Date().toISOString(),
      error: null,
    };
  } catch (fallbackError) {
    disk = {
      path: diskPath,
      sizeBytes: null,
      usedBytes: null,
      availableBytes: null,
      usedPercent: null,
      status: "unknown",
      checkedAt: new Date().toISOString(),
      error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
    };
  }

  const partial = {
    schemaVersion: 1 as const,
    source: "runtime_fallback" as const,
    generatedAt: new Date().toISOString(),
    statusFile: {
      path: statusFilePath,
      loaded: false,
      error,
    },
    disk,
    backupTimer: {
      name: process.env.ROOMPIRE_BACKUP_TIMER?.trim() || "roompire-backup.timer",
      activeState: "unknown",
      enabledState: "unknown",
      nextElapse: null,
      lastTrigger: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    backupService: {
      name: process.env.ROOMPIRE_BACKUP_SERVICE?.trim() || "roompire-backup.service",
      activeState: "unknown",
      result: "unknown",
      execMainStatus: "unknown",
      startedAt: null,
      finishedAt: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    housekeepingTimer: {
      name: process.env.ROOMPIRE_HOUSEKEEPING_TIMER?.trim() || "roompire-housekeeping.timer",
      activeState: "unknown",
      enabledState: "unknown",
      nextElapse: null,
      lastTrigger: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    housekeepingService: {
      name: process.env.ROOMPIRE_HOUSEKEEPING_SERVICE?.trim() || "roompire-housekeeping.service",
      activeState: "unknown",
      result: "unknown",
      execMainStatus: "unknown",
      startedAt: null,
      finishedAt: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    backupEncryption: {
      backupRoot:
        process.env.ROOMPIRE_BACKUP_ROOT?.trim() ||
        process.env.BACKUP_ROOT?.trim() ||
        "/srv/aialra/backups/roompire",
      configured: "unknown" as const,
      passphraseFileConfigured: false,
      passphraseFileExists: null,
      encryptedArtifacts: 0,
      plaintextArtifacts: 0,
      missingSha256Sidecars: 0,
      latestEncryptedArtifact: null,
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    dockerStorage: {
      images: normalizeDockerStorageCategory(null),
      containers: normalizeDockerStorageCategory(null),
      localVolumes: normalizeDockerStorageCategory(null),
      buildCache: normalizeDockerStorageCategory(null),
      totalReclaimableBytes: 0,
      reclaimableWarningBytes: dockerReclaimableWarningBytes,
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    backupOffsite: {
      mode: "unknown" as const,
      configured: false,
      targetConfigured: false,
      target: null,
      statusFile:
        process.env.ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE?.trim() || "ops/status/backup-offsite.json",
      lastSyncAt: null,
      artifactCount: 0,
      totalBytes: 0,
      latestArtifact: null,
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    latestSmoke: normalizeSmoke(null),
  };
  const warnings = deriveWarnings(partial);

  return {
    ...partial,
    summary: {
      status: warnings.length > 0 ? ("warning" as const) : ("ok" as const),
      warnings,
    },
  };
}

export async function readOpsStatus() {
  const statusFile = await readConfiguredStatusFile();

  if (!statusFile.text) {
    return runtimeFallbackStatus(statusFile.path, statusFile.error ?? null);
  }

  try {
    return normalizeLoadedStatus(JSON.parse(statusFile.text), statusFile.path);
  } catch (error) {
    return runtimeFallbackStatus(
      statusFile.path,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function requireOpsStatusViewer(user: User) {
  const configuredSiteGateEmail = resolveConfiguredSiteGateSessionEmail();

  if (configuredSiteGateEmail && configuredSiteGateEmail === user.email.trim().toLowerCase()) {
    return;
  }

  const adminMembershipCount = await prisma.householdMembership.count({
    where: {
      userId: user.id,
      status: "ACTIVE",
      role: {
        in: ["OWNER", "ADMIN"],
      },
    },
  });

  if (adminMembershipCount === 0) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only the site gate owner or household owners and admins can view ops health.",
    );
  }
}

export async function readOpsStatusForUser(user: User) {
  await requireOpsStatusViewer(user);

  return readOpsStatus();
}
