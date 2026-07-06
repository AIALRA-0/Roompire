import { readFile, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import type { User } from "@prisma/client";
import { ApiError } from "@/server/api/errors";
import { resolveConfiguredSiteGateSessionEmail } from "@/server/auth/site-gate";
import { prisma } from "@/server/db/prisma";

type HealthState = "ok" | "warning" | "unknown";
type SmokeState = "passed" | "failed" | "missing" | "unknown";
type RestoreDrillState = "passed" | "failed" | "missing" | "unknown";
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

export type OpsRestoreDrillStatus = {
  status: RestoreDrillState;
  generatedAt: string | null;
  backupFile: string | null;
  drillDatabase: string | null;
  auditTotal: number | null;
  auditHashed: number | null;
  auditBroken: number | null;
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
  rootStorageInventory: {
    topLimit: number;
    timeoutMs: number;
    totalBytes: number;
    paths: OpsRootStorageInventoryItem[];
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  sharedAppStorageInventory: {
    status: HealthState;
    statusFile: string;
    generatedAt: string | null;
    roots: string[];
    topLimit: number;
    totalTimeoutMs: number;
    pathTimeoutMs: number;
    totalBytes: number;
    paths: OpsRootStorageInventoryItem[];
    skippedPaths: string[];
    timedOutPaths: string[];
    errors: Array<{ path: string; message: string }>;
    checkedAt: string | null;
    error: string | null;
  };
  diskTrend: {
    status: HealthState;
    historyFile: string;
    sampleCount: number;
    oldestCheckedAt: string | null;
    newestCheckedAt: string | null;
    windowHours: number | null;
    availableChangeBytes: number | null;
    usedChangeBytes: number | null;
    usedPercentChange: number | null;
    averageUsedBytesPerDay: number | null;
    estimatedDaysUntilFull: number | null;
    warningDays: number;
    minimumWindowHours: number;
    checkedAt: string | null;
    error: string | null;
  };
  dockerStorage: {
    images: OpsDockerStorageCategory;
    containers: OpsDockerStorageCategory;
    localVolumes: OpsDockerStorageCategory;
    buildCache: OpsDockerStorageCategory;
    totalReclaimableBytes: number;
    safeReclaimableBytes: number;
    unsafeReclaimableBytes: number;
    reclaimableWarningBytes: number;
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  dockerImageInventory: {
    topLimit: number;
    totalImageBytes: number;
    activeImageBytes: number;
    inactiveImageBytes: number;
    safeReclaimableImageBytes: number;
    images: OpsDockerImageInventoryItem[];
    reclaimableCandidates: OpsDockerImageInventoryItem[];
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  containerHealth: {
    containers: OpsContainerHealthItem[];
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  opsStatusTimer: {
    name: string;
    activeState: string;
    enabledState: string;
    nextElapse: string | null;
    lastTrigger: string | null;
    status: HealthState;
    error: string | null;
  };
  opsStatusService: {
    name: string;
    activeState: string;
    result: string;
    execMainStatus: string;
    startedAt: string | null;
    finishedAt: string | null;
    status: HealthState;
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
  smokeTimer: {
    name: string;
    activeState: string;
    enabledState: string;
    nextElapse: string | null;
    lastTrigger: string | null;
    status: HealthState;
    error: string | null;
  };
  smokeService: {
    name: string;
    activeState: string;
    result: string;
    execMainStatus: string;
    startedAt: string | null;
    finishedAt: string | null;
    status: HealthState;
    error: string | null;
  };
  reminderTimer: {
    name: string;
    activeState: string;
    enabledState: string;
    nextElapse: string | null;
    lastTrigger: string | null;
    status: HealthState;
    error: string | null;
  };
  reminderService: {
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
    sourceDeviceId: string | null;
    targetDeviceId: string | null;
    sameFilesystem: boolean | null;
    sameFilesystemAllowed: boolean;
    status: HealthState;
    checkedAt: string | null;
    error: string | null;
  };
  latestSmoke: OpsSmokeStatus;
  latestRestoreDrill: OpsRestoreDrillStatus;
};

export type OpsDockerStorageCategory = {
  totalCount: number;
  activeCount: number;
  sizeBytes: number;
  reclaimableBytes: number;
  reclaimablePercent: number | null;
};

export type OpsDockerImageInventoryItem = {
  repository: string;
  tag: string;
  imageId: string;
  reference: string;
  sizeBytes: number;
  containers: number;
  createdAt: string | null;
};

export type OpsRootStorageInventoryItem = {
  path: string;
  sizeBytes: number;
};

export type OpsContainerHealthItem = {
  name: string;
  image: string;
  state: string;
  running: boolean;
  health: string;
  restartCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  status: HealthState;
  error: string | null;
};

const diskWarningAvailableBytes = 5 * 1024 * 1024 * 1024;
const dockerReclaimableWarningBytes = 5 * 1024 * 1024 * 1024;
const staleStatusMs = 36 * 60 * 60 * 1000;
const smokeStatusStaleMs = positiveEnvNumber("ROOMPIRE_SMOKE_STATUS_STALE_MS", 2 * 60 * 60 * 1000);
const restoreDrillStatusStaleMs = positiveEnvNumber(
  "ROOMPIRE_RESTORE_DRILL_STATUS_STALE_MS",
  36 * 60 * 60 * 1000,
);
const sharedAppStorageStatusStaleMs = positiveEnvNumber(
  "ROOMPIRE_SHARED_APP_STORAGE_STATUS_STALE_MS",
  48 * 60 * 60 * 1000,
);

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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

function restoreDrillStateValue(value: unknown): RestoreDrillState {
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

function normalizeDockerImageInventoryItem(value: unknown): OpsDockerImageInventoryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const repository = stringValue(value.repository, "<none>");
  const tag = stringValue(value.tag, "<none>");
  const imageId = stringValue(value.imageId);
  const reference = stringValue(value.reference, `${repository}:${tag}`);

  return {
    repository,
    tag,
    imageId,
    reference,
    sizeBytes: numberValue(value.sizeBytes) ?? 0,
    containers: numberValue(value.containers) ?? 0,
    createdAt: nullableStringValue(value.createdAt),
  };
}

function normalizeDockerImageInventory(value: unknown): OpsStatusSnapshot["dockerImageInventory"] {
  if (!isRecord(value)) {
    return {
      topLimit: 8,
      totalImageBytes: 0,
      activeImageBytes: 0,
      inactiveImageBytes: 0,
      safeReclaimableImageBytes: 0,
      images: [],
      reclaimableCandidates: [],
      status: "unknown",
      checkedAt: null,
      error: "Docker image inventory has not been recorded yet.",
    };
  }

  return {
    topLimit: numberValue(value.topLimit) ?? 8,
    totalImageBytes: numberValue(value.totalImageBytes) ?? 0,
    activeImageBytes: numberValue(value.activeImageBytes) ?? 0,
    inactiveImageBytes: numberValue(value.inactiveImageBytes) ?? 0,
    safeReclaimableImageBytes: numberValue(value.safeReclaimableImageBytes) ?? 0,
    images: Array.isArray(value.images)
      ? value.images.map(normalizeDockerImageInventoryItem).filter((image) => image !== null)
      : [],
    reclaimableCandidates: Array.isArray(value.reclaimableCandidates)
      ? value.reclaimableCandidates
          .map(normalizeDockerImageInventoryItem)
          .filter((image) => image !== null)
      : [],
    status: healthStateValue(value.status),
    checkedAt: nullableStringValue(value.checkedAt),
    error: nullableStringValue(value.error),
  };
}

function normalizeContainerHealthItem(value: unknown): OpsContainerHealthItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = stringValue(value.name);

  if (!name) {
    return null;
  }

  return {
    name,
    image: stringValue(value.image),
    state: stringValue(value.state, "unknown"),
    running: booleanValue(value.running),
    health: stringValue(value.health, "unknown"),
    restartCount: numberValue(value.restartCount) ?? 0,
    startedAt: nullableStringValue(value.startedAt),
    finishedAt: nullableStringValue(value.finishedAt),
    status: healthStateValue(value.status),
    error: nullableStringValue(value.error),
  };
}

function normalizeContainerHealth(value: unknown): OpsStatusSnapshot["containerHealth"] {
  if (!isRecord(value)) {
    return {
      containers: [],
      status: "unknown",
      checkedAt: null,
      error: "Container health has not been recorded yet.",
    };
  }

  return {
    containers: Array.isArray(value.containers)
      ? value.containers.map(normalizeContainerHealthItem).filter((item) => item !== null)
      : [],
    status: healthStateValue(value.status),
    checkedAt: nullableStringValue(value.checkedAt),
    error: nullableStringValue(value.error),
  };
}

function normalizeRootStorageInventoryItem(value: unknown): OpsRootStorageInventoryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const itemPath = stringValue(value.path);

  if (!itemPath) {
    return null;
  }

  return {
    path: itemPath,
    sizeBytes: numberValue(value.sizeBytes) ?? 0,
  };
}

function normalizeRootStorageInventory(value: unknown): OpsStatusSnapshot["rootStorageInventory"] {
  if (!isRecord(value)) {
    return {
      topLimit: 8,
      timeoutMs: 60000,
      totalBytes: 0,
      paths: [],
      status: "unknown",
      checkedAt: null,
      error: "Root storage inventory has not been recorded yet.",
    };
  }

  return {
    topLimit: numberValue(value.topLimit) ?? 8,
    timeoutMs: numberValue(value.timeoutMs) ?? 60000,
    totalBytes: numberValue(value.totalBytes) ?? 0,
    paths: Array.isArray(value.paths)
      ? value.paths.map(normalizeRootStorageInventoryItem).filter((item) => item !== null)
      : [],
    status: healthStateValue(value.status),
    checkedAt: nullableStringValue(value.checkedAt),
    error: nullableStringValue(value.error),
  };
}

function normalizeSharedAppStorageError(value: unknown): { path: string; message: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const itemPath = stringValue(value.path);
  const message = stringValue(value.message);

  if (!itemPath || !message) {
    return null;
  }

  return {
    path: itemPath,
    message,
  };
}

function normalizeSharedAppStorageInventory(
  value: unknown,
): OpsStatusSnapshot["sharedAppStorageInventory"] {
  if (!isRecord(value)) {
    return {
      status: "unknown",
      statusFile: "ops/status/shared-app-storage.json",
      generatedAt: null,
      roots: [],
      topLimit: 12,
      totalTimeoutMs: 240000,
      pathTimeoutMs: 45000,
      totalBytes: 0,
      paths: [],
      skippedPaths: [],
      timedOutPaths: [],
      errors: [],
      checkedAt: null,
      error: "Shared app storage inventory has not been recorded yet.",
    };
  }

  return {
    status: healthStateValue(value.status),
    statusFile: stringValue(value.statusFile, "ops/status/shared-app-storage.json"),
    generatedAt: nullableStringValue(value.generatedAt),
    roots: Array.isArray(value.roots)
      ? value.roots.filter((root): root is string => typeof root === "string")
      : [],
    topLimit: numberValue(value.topLimit) ?? 12,
    totalTimeoutMs: numberValue(value.totalTimeoutMs) ?? 240000,
    pathTimeoutMs: numberValue(value.pathTimeoutMs) ?? 45000,
    totalBytes: numberValue(value.totalBytes) ?? 0,
    paths: Array.isArray(value.paths)
      ? value.paths.map(normalizeRootStorageInventoryItem).filter((item) => item !== null)
      : [],
    skippedPaths: Array.isArray(value.skippedPaths)
      ? value.skippedPaths.filter((item): item is string => typeof item === "string")
      : [],
    timedOutPaths: Array.isArray(value.timedOutPaths)
      ? value.timedOutPaths.filter((item): item is string => typeof item === "string")
      : [],
    errors: Array.isArray(value.errors)
      ? value.errors.map(normalizeSharedAppStorageError).filter((item) => item !== null)
      : [],
    checkedAt: nullableStringValue(value.checkedAt),
    error: nullableStringValue(value.error),
  };
}

function normalizeDiskTrend(value: unknown): OpsStatusSnapshot["diskTrend"] {
  if (!isRecord(value)) {
    return {
      status: "unknown",
      historyFile: "ops/status/disk-history.json",
      sampleCount: 0,
      oldestCheckedAt: null,
      newestCheckedAt: null,
      windowHours: null,
      availableChangeBytes: null,
      usedChangeBytes: null,
      usedPercentChange: null,
      averageUsedBytesPerDay: null,
      estimatedDaysUntilFull: null,
      warningDays: 14,
      minimumWindowHours: 6,
      checkedAt: null,
      error: "Disk trend has not been recorded yet.",
    };
  }

  return {
    status: healthStateValue(value.status),
    historyFile: stringValue(value.historyFile, "ops/status/disk-history.json"),
    sampleCount: numberValue(value.sampleCount) ?? 0,
    oldestCheckedAt: nullableStringValue(value.oldestCheckedAt),
    newestCheckedAt: nullableStringValue(value.newestCheckedAt),
    windowHours: numberValue(value.windowHours),
    availableChangeBytes: numberValue(value.availableChangeBytes),
    usedChangeBytes: numberValue(value.usedChangeBytes),
    usedPercentChange: numberValue(value.usedPercentChange),
    averageUsedBytesPerDay: numberValue(value.averageUsedBytesPerDay),
    estimatedDaysUntilFull: numberValue(value.estimatedDaysUntilFull),
    warningDays: numberValue(value.warningDays) ?? 14,
    minimumWindowHours: numberValue(value.minimumWindowHours) ?? 6,
    checkedAt: nullableStringValue(value.checkedAt),
    error: nullableStringValue(value.error),
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

function normalizeRestoreDrill(value: unknown): OpsRestoreDrillStatus {
  if (!isRecord(value)) {
    return {
      status: "missing",
      generatedAt: null,
      backupFile: null,
      drillDatabase: null,
      auditTotal: null,
      auditHashed: null,
      auditBroken: null,
      message: "No restore-drill status has been recorded yet.",
    };
  }

  return {
    status: restoreDrillStateValue(value.status),
    generatedAt: nullableStringValue(value.generatedAt),
    backupFile: nullableStringValue(value.backupFile),
    drillDatabase: nullableStringValue(value.drillDatabase),
    auditTotal: numberValue(value.auditTotal),
    auditHashed: numberValue(value.auditHashed),
    auditBroken: numberValue(value.auditBroken),
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
  const latestSmokeGeneratedAtTime = status.latestSmoke.generatedAt
    ? Date.parse(status.latestSmoke.generatedAt)
    : Number.NaN;
  const latestRestoreDrillGeneratedAtTime = status.latestRestoreDrill.generatedAt
    ? Date.parse(status.latestRestoreDrill.generatedAt)
    : Number.NaN;
  const sharedAppStorageGeneratedAtTime = status.sharedAppStorageInventory.generatedAt
    ? Date.parse(status.sharedAppStorageInventory.generatedAt)
    : Number.NaN;

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

  if (status.diskTrend.status === "warning") {
    warnings.push("disk_trend_depleting");
  }

  if (status.rootStorageInventory.status === "unknown") {
    warnings.push("root_storage_inventory_unknown");
  }

  if (status.sharedAppStorageInventory.status === "warning") {
    warnings.push("shared_app_storage_attention");
  }

  if (
    status.sharedAppStorageInventory.generatedAt !== null &&
    (!Number.isFinite(sharedAppStorageGeneratedAtTime) ||
      Date.now() - sharedAppStorageGeneratedAtTime > sharedAppStorageStatusStaleMs)
  ) {
    warnings.push("shared_app_storage_stale");
  }

  if (status.dockerStorage.status === "unknown") {
    warnings.push("docker_storage_unknown");
  }

  if (status.dockerImageInventory.status === "unknown") {
    warnings.push("docker_image_inventory_unknown");
  }

  if (status.containerHealth.status === "unknown") {
    warnings.push("container_health_unknown");
  } else if (status.containerHealth.status === "warning") {
    warnings.push("container_health_attention");
  }

  if (status.dockerStorage.status === "warning") {
    warnings.push("docker_safe_reclaimable_high");
  }

  if (status.opsStatusTimer.status !== "ok") {
    warnings.push("ops_status_timer_attention");
  }

  if (status.opsStatusService.status === "warning") {
    warnings.push("ops_status_service_attention");
  }

  if (status.backupTimer.status !== "ok") {
    warnings.push("backup_timer_attention");
  }

  if (status.backupService.status === "warning") {
    warnings.push("backup_service_attention");
  }

  if (status.smokeTimer.status !== "ok") {
    warnings.push("smoke_timer_attention");
  }

  if (status.smokeService.status === "warning") {
    warnings.push("smoke_service_attention");
  }

  if (status.reminderTimer.status !== "ok") {
    warnings.push("reminder_timer_attention");
  }

  if (status.reminderService.status === "warning") {
    warnings.push("reminder_service_attention");
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
  } else {
    if (status.backupOffsite.status !== "ok") {
      warnings.push("backup_offsite_attention");
    }

    if (status.backupOffsite.sameFilesystem === true) {
      warnings.push("backup_offsite_same_filesystem");
    }
  }

  if (status.latestRestoreDrill.status === "failed") {
    warnings.push("restore_drill_failed");
  }

  if (
    status.latestRestoreDrill.status === "missing" ||
    status.latestRestoreDrill.status === "unknown"
  ) {
    warnings.push("restore_drill_missing");
  }

  if (
    status.latestRestoreDrill.status !== "missing" &&
    status.latestRestoreDrill.status !== "unknown" &&
    (!Number.isFinite(latestRestoreDrillGeneratedAtTime) ||
      Date.now() - latestRestoreDrillGeneratedAtTime > restoreDrillStatusStaleMs)
  ) {
    warnings.push("restore_drill_stale");
  }

  if (status.latestSmoke.status === "failed") {
    warnings.push("smoke_failed");
  }

  if (status.latestSmoke.status === "missing" || status.latestSmoke.status === "unknown") {
    warnings.push("smoke_missing");
  }

  if (
    status.latestSmoke.status !== "missing" &&
    status.latestSmoke.status !== "unknown" &&
    (!Number.isFinite(latestSmokeGeneratedAtTime) ||
      Date.now() - latestSmokeGeneratedAtTime > smokeStatusStaleMs)
  ) {
    warnings.push("smoke_stale");
  }

  return warnings;
}

function normalizeLoadedStatus(parsed: unknown, filePath: string): OpsStatusSnapshot {
  const raw = isRecord(parsed) ? parsed : {};
  const rawDisk = isRecord(raw.disk) ? raw.disk : {};
  const rawDiskTrend = isRecord(raw.diskTrend) ? raw.diskTrend : {};
  const rawRootStorageInventory = isRecord(raw.rootStorageInventory)
    ? raw.rootStorageInventory
    : {};
  const rawSharedAppStorageInventory = isRecord(raw.sharedAppStorageInventory)
    ? raw.sharedAppStorageInventory
    : {};
  const rawBackupTimer = isRecord(raw.backupTimer) ? raw.backupTimer : {};
  const rawBackupService = isRecord(raw.backupService) ? raw.backupService : {};
  const rawDockerStorage = isRecord(raw.dockerStorage) ? raw.dockerStorage : {};
  const rawDockerImageInventory = isRecord(raw.dockerImageInventory)
    ? raw.dockerImageInventory
    : {};
  const rawContainerHealth = isRecord(raw.containerHealth) ? raw.containerHealth : {};
  const rawOpsStatusTimer = isRecord(raw.opsStatusTimer) ? raw.opsStatusTimer : {};
  const rawOpsStatusService = isRecord(raw.opsStatusService) ? raw.opsStatusService : {};
  const rawSmokeTimer = isRecord(raw.smokeTimer) ? raw.smokeTimer : {};
  const rawSmokeService = isRecord(raw.smokeService) ? raw.smokeService : {};
  const rawReminderTimer = isRecord(raw.reminderTimer) ? raw.reminderTimer : {};
  const rawReminderService = isRecord(raw.reminderService) ? raw.reminderService : {};
  const rawHousekeepingTimer = isRecord(raw.housekeepingTimer) ? raw.housekeepingTimer : {};
  const rawHousekeepingService = isRecord(raw.housekeepingService) ? raw.housekeepingService : {};
  const rawBackupEncryption = isRecord(raw.backupEncryption) ? raw.backupEncryption : {};
  const rawBackupOffsite = isRecord(raw.backupOffsite) ? raw.backupOffsite : {};
  const availableBytes = numberValue(rawDisk.availableBytes);
  const usedPercent = numberValue(rawDisk.usedPercent);
  const diskStatus = healthStateValue(rawDisk.status);
  const dockerImages = normalizeDockerStorageCategory(rawDockerStorage.images);
  const dockerContainers = normalizeDockerStorageCategory(rawDockerStorage.containers);
  const dockerLocalVolumes = normalizeDockerStorageCategory(rawDockerStorage.localVolumes);
  const dockerBuildCache = normalizeDockerStorageCategory(rawDockerStorage.buildCache);
  const dockerTotalReclaimableBytes = numberValue(rawDockerStorage.totalReclaimableBytes) ?? 0;
  const dockerSafeReclaimableBytes =
    numberValue(rawDockerStorage.safeReclaimableBytes) ?? dockerBuildCache.sizeBytes;
  const dockerUnsafeReclaimableBytes =
    numberValue(rawDockerStorage.unsafeReclaimableBytes) ??
    Math.max(dockerTotalReclaimableBytes - dockerSafeReclaimableBytes, 0);
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
    rootStorageInventory: normalizeRootStorageInventory(rawRootStorageInventory),
    sharedAppStorageInventory: normalizeSharedAppStorageInventory(rawSharedAppStorageInventory),
    diskTrend: normalizeDiskTrend(rawDiskTrend),
    dockerStorage: {
      images: dockerImages,
      containers: dockerContainers,
      localVolumes: dockerLocalVolumes,
      buildCache: dockerBuildCache,
      totalReclaimableBytes: dockerTotalReclaimableBytes,
      safeReclaimableBytes: dockerSafeReclaimableBytes,
      unsafeReclaimableBytes: dockerUnsafeReclaimableBytes,
      reclaimableWarningBytes:
        numberValue(rawDockerStorage.reclaimableWarningBytes) ?? dockerReclaimableWarningBytes,
      status: healthStateValue(rawDockerStorage.status),
      checkedAt: nullableStringValue(rawDockerStorage.checkedAt),
      error: nullableStringValue(rawDockerStorage.error),
    },
    dockerImageInventory: normalizeDockerImageInventory(rawDockerImageInventory),
    containerHealth: normalizeContainerHealth(rawContainerHealth),
    opsStatusTimer: {
      name: stringValue(rawOpsStatusTimer.name, "roompire-ops-status.timer"),
      activeState: stringValue(rawOpsStatusTimer.activeState, "unknown"),
      enabledState: stringValue(rawOpsStatusTimer.enabledState, "unknown"),
      nextElapse: nullableStringValue(rawOpsStatusTimer.nextElapse),
      lastTrigger: nullableStringValue(rawOpsStatusTimer.lastTrigger),
      status: healthStateValue(rawOpsStatusTimer.status),
      error: nullableStringValue(rawOpsStatusTimer.error),
    },
    opsStatusService: {
      name: stringValue(rawOpsStatusService.name, "roompire-ops-status.service"),
      activeState: stringValue(rawOpsStatusService.activeState, "unknown"),
      result: stringValue(rawOpsStatusService.result, "unknown"),
      execMainStatus: stringValue(rawOpsStatusService.execMainStatus, "unknown"),
      startedAt: nullableStringValue(rawOpsStatusService.startedAt),
      finishedAt: nullableStringValue(rawOpsStatusService.finishedAt),
      status: healthStateValue(rawOpsStatusService.status),
      error: nullableStringValue(rawOpsStatusService.error),
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
    smokeTimer: {
      name: stringValue(rawSmokeTimer.name, "roompire-smoke.timer"),
      activeState: stringValue(rawSmokeTimer.activeState, "unknown"),
      enabledState: stringValue(rawSmokeTimer.enabledState, "unknown"),
      nextElapse: nullableStringValue(rawSmokeTimer.nextElapse),
      lastTrigger: nullableStringValue(rawSmokeTimer.lastTrigger),
      status: healthStateValue(rawSmokeTimer.status),
      error: nullableStringValue(rawSmokeTimer.error),
    },
    smokeService: {
      name: stringValue(rawSmokeService.name, "roompire-smoke.service"),
      activeState: stringValue(rawSmokeService.activeState, "unknown"),
      result: stringValue(rawSmokeService.result, "unknown"),
      execMainStatus: stringValue(rawSmokeService.execMainStatus, "unknown"),
      startedAt: nullableStringValue(rawSmokeService.startedAt),
      finishedAt: nullableStringValue(rawSmokeService.finishedAt),
      status: healthStateValue(rawSmokeService.status),
      error: nullableStringValue(rawSmokeService.error),
    },
    reminderTimer: {
      name: stringValue(rawReminderTimer.name, "roompire-reminders.timer"),
      activeState: stringValue(rawReminderTimer.activeState, "unknown"),
      enabledState: stringValue(rawReminderTimer.enabledState, "unknown"),
      nextElapse: nullableStringValue(rawReminderTimer.nextElapse),
      lastTrigger: nullableStringValue(rawReminderTimer.lastTrigger),
      status: healthStateValue(rawReminderTimer.status),
      error: nullableStringValue(rawReminderTimer.error),
    },
    reminderService: {
      name: stringValue(rawReminderService.name, "roompire-reminders.service"),
      activeState: stringValue(rawReminderService.activeState, "unknown"),
      result: stringValue(rawReminderService.result, "unknown"),
      execMainStatus: stringValue(rawReminderService.execMainStatus, "unknown"),
      startedAt: nullableStringValue(rawReminderService.startedAt),
      finishedAt: nullableStringValue(rawReminderService.finishedAt),
      status: healthStateValue(rawReminderService.status),
      error: nullableStringValue(rawReminderService.error),
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
      sourceDeviceId: nullableStringValue(rawBackupOffsite.sourceDeviceId),
      targetDeviceId: nullableStringValue(rawBackupOffsite.targetDeviceId),
      sameFilesystem: nullableBooleanValue(rawBackupOffsite.sameFilesystem),
      sameFilesystemAllowed: booleanValue(rawBackupOffsite.sameFilesystemAllowed),
      status: healthStateValue(rawBackupOffsite.status),
      checkedAt: nullableStringValue(rawBackupOffsite.checkedAt),
      error: nullableStringValue(rawBackupOffsite.error),
    },
    latestSmoke: normalizeSmoke(raw.latestSmoke),
    latestRestoreDrill: normalizeRestoreDrill(raw.latestRestoreDrill),
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
    rootStorageInventory: {
      topLimit: 8,
      timeoutMs: 60000,
      totalBytes: 0,
      paths: [],
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    sharedAppStorageInventory: {
      status: "unknown" as const,
      statusFile:
        process.env.ROOMPIRE_SHARED_APP_STORAGE_STATUS_FILE?.trim() ||
        "ops/status/shared-app-storage.json",
      generatedAt: null,
      roots: [],
      topLimit: 12,
      totalTimeoutMs: 240000,
      pathTimeoutMs: 45000,
      totalBytes: 0,
      paths: [],
      skippedPaths: [],
      timedOutPaths: [],
      errors: [],
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    diskTrend: {
      status: "unknown" as const,
      historyFile:
        process.env.ROOMPIRE_OPS_DISK_HISTORY_FILE?.trim() || "ops/status/disk-history.json",
      sampleCount: 0,
      oldestCheckedAt: null,
      newestCheckedAt: null,
      windowHours: null,
      availableChangeBytes: null,
      usedChangeBytes: null,
      usedPercentChange: null,
      averageUsedBytesPerDay: null,
      estimatedDaysUntilFull: null,
      warningDays: 14,
      minimumWindowHours: 6,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
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
    reminderTimer: {
      name: process.env.ROOMPIRE_REMINDER_TIMER?.trim() || "roompire-reminders.timer",
      activeState: "unknown",
      enabledState: "unknown",
      nextElapse: null,
      lastTrigger: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    reminderService: {
      name: process.env.ROOMPIRE_REMINDER_SERVICE?.trim() || "roompire-reminders.service",
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
      safeReclaimableBytes: 0,
      unsafeReclaimableBytes: 0,
      reclaimableWarningBytes: dockerReclaimableWarningBytes,
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    dockerImageInventory: {
      topLimit: 8,
      totalImageBytes: 0,
      activeImageBytes: 0,
      inactiveImageBytes: 0,
      safeReclaimableImageBytes: 0,
      images: [],
      reclaimableCandidates: [],
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    containerHealth: {
      containers: [],
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    opsStatusTimer: {
      name: process.env.ROOMPIRE_OPS_STATUS_TIMER?.trim() || "roompire-ops-status.timer",
      activeState: "unknown",
      enabledState: "unknown",
      nextElapse: null,
      lastTrigger: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    opsStatusService: {
      name: process.env.ROOMPIRE_OPS_STATUS_SERVICE?.trim() || "roompire-ops-status.service",
      activeState: "unknown",
      result: "unknown",
      execMainStatus: "unknown",
      startedAt: null,
      finishedAt: null,
      status: "unknown" as const,
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
      sourceDeviceId: null,
      targetDeviceId: null,
      sameFilesystem: null,
      sameFilesystemAllowed: false,
      status: "unknown" as const,
      checkedAt: new Date().toISOString(),
      error: "Host status file has not been generated.",
    },
    smokeTimer: {
      name: process.env.ROOMPIRE_SMOKE_TIMER?.trim() || "roompire-smoke.timer",
      activeState: "unknown",
      enabledState: "unknown",
      nextElapse: null,
      lastTrigger: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    smokeService: {
      name: process.env.ROOMPIRE_SMOKE_SERVICE?.trim() || "roompire-smoke.service",
      activeState: "unknown",
      result: "unknown",
      execMainStatus: "unknown",
      startedAt: null,
      finishedAt: null,
      status: "unknown" as const,
      error: "Host status file has not been generated.",
    },
    latestSmoke: normalizeSmoke(null),
    latestRestoreDrill: normalizeRestoreDrill(null),
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
