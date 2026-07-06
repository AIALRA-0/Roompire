#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const outputPath = process.env.ROOMPIRE_OPS_STATUS_FILE_HOST || "ops/status/ops-status.json";
const diskPath = process.env.ROOMPIRE_OPS_DISK_PATH || "/";
const opsStatusTimerName = process.env.ROOMPIRE_OPS_STATUS_TIMER || "roompire-ops-status.timer";
const opsStatusServiceName =
  process.env.ROOMPIRE_OPS_STATUS_SERVICE || "roompire-ops-status.service";
const backupTimerName = process.env.ROOMPIRE_BACKUP_TIMER || "roompire-backup.timer";
const backupServiceName = process.env.ROOMPIRE_BACKUP_SERVICE || "roompire-backup.service";
const smokeTimerName = process.env.ROOMPIRE_SMOKE_TIMER || "roompire-smoke.timer";
const smokeServiceName = process.env.ROOMPIRE_SMOKE_SERVICE || "roompire-smoke.service";
const reminderTimerName = process.env.ROOMPIRE_REMINDER_TIMER || "roompire-reminders.timer";
const reminderServiceName =
  process.env.ROOMPIRE_REMINDER_SERVICE || "roompire-reminders.service";
const housekeepingTimerName =
  process.env.ROOMPIRE_HOUSEKEEPING_TIMER || "roompire-housekeeping.timer";
const housekeepingServiceName =
  process.env.ROOMPIRE_HOUSEKEEPING_SERVICE || "roompire-housekeeping.service";
const backupRoot =
  process.env.ROOMPIRE_BACKUP_ROOT || process.env.BACKUP_ROOT || "/srv/aialra/backups/roompire";
const configuredBackupFreshnessStaleMs = Number(
  process.env.ROOMPIRE_BACKUP_FRESHNESS_STALE_MS || 36 * 60 * 60 * 1000,
);
const backupFreshnessStaleMs =
  Number.isFinite(configuredBackupFreshnessStaleMs) && configuredBackupFreshnessStaleMs > 0
    ? configuredBackupFreshnessStaleMs
    : 36 * 60 * 60 * 1000;
const backupPassphraseEscrowStatusPath =
  process.env.ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_STATUS_FILE ||
  "ops/status/backup-passphrase-escrow.json";
const configuredBackupPassphraseEscrowStaleMs = Number(
  process.env.ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_STALE_MS || 180 * 24 * 60 * 60 * 1000,
);
const backupPassphraseEscrowStaleMs =
  Number.isFinite(configuredBackupPassphraseEscrowStaleMs) &&
  configuredBackupPassphraseEscrowStaleMs > 0
    ? configuredBackupPassphraseEscrowStaleMs
    : 180 * 24 * 60 * 60 * 1000;
const backupOffsiteStatusPath =
  process.env.ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE || "ops/status/backup-offsite.json";
const smokeStatusPath = process.env.ROOMPIRE_SMOKE_STATUS_FILE || "ops/status/latest-smoke.json";
const restoreDrillStatusPath =
  process.env.ROOMPIRE_RESTORE_DRILL_STATUS_FILE || "ops/status/latest-restore-drill.json";
const housekeepingStatusPath =
  process.env.ROOMPIRE_HOUSEKEEPING_STATUS_FILE || "ops/status/latest-housekeeping.json";
const sharedAppStorageStatusPath =
  process.env.ROOMPIRE_SHARED_APP_STORAGE_STATUS_FILE ||
  "ops/status/shared-app-storage.json";
const diskHistoryPath = process.env.ROOMPIRE_OPS_DISK_HISTORY_FILE || "ops/status/disk-history.json";
const generatedAt = new Date().toISOString();
const diskWarningAvailableBytes = 5 * 1024 * 1024 * 1024;
const configuredDeployMinAvailableBytes = Number(
  process.env.ROOMPIRE_DEPLOY_MIN_AVAILABLE_BYTES || 6 * 1024 * 1024 * 1024,
);
const deployMinAvailableBytes =
  Number.isFinite(configuredDeployMinAvailableBytes) && configuredDeployMinAvailableBytes > 0
    ? configuredDeployMinAvailableBytes
    : 6 * 1024 * 1024 * 1024;
const diskTrendWarningDays = Number(process.env.ROOMPIRE_OPS_DISK_TREND_WARNING_DAYS || 14);
const diskTrendMinimumWindowHours = Number(
  process.env.ROOMPIRE_OPS_DISK_TREND_MIN_WINDOW_HOURS || 6,
);
const diskHistoryMaxSamples = Number(process.env.ROOMPIRE_OPS_DISK_HISTORY_MAX_SAMPLES || 672);
const configuredDockerReclaimableWarningBytes = Number(
  process.env.ROOMPIRE_DOCKER_RECLAIMABLE_WARNING_BYTES || 5 * 1024 * 1024 * 1024,
);
const dockerReclaimableWarningBytes = Number.isFinite(configuredDockerReclaimableWarningBytes)
  ? configuredDockerReclaimableWarningBytes
  : 5 * 1024 * 1024 * 1024;
const dockerImageInventoryLimit = Number(process.env.ROOMPIRE_DOCKER_IMAGE_INVENTORY_LIMIT || 8);
const containerHealthNames = String(
  process.env.ROOMPIRE_CONTAINER_HEALTH_CONTAINERS ||
    "roompire-web-1 roompire-postgres-1 roompire-redis-1",
)
  .split(/\s+/)
  .map((value) => value.trim())
  .filter(Boolean);
const rootStorageInventoryLimit = Number(process.env.ROOMPIRE_ROOT_STORAGE_INVENTORY_LIMIT || 8);
const rootStorageInventoryTimeoutMs = Number(
  process.env.ROOMPIRE_ROOT_STORAGE_INVENTORY_TIMEOUT_MS || 60000,
);
const rootStorageInventoryPaths = String(
  process.env.ROOMPIRE_ROOT_STORAGE_INVENTORY_PATHS ||
    [
      "/var/lib/containerd",
      "/var/lib/docker",
      "/var/lib/snapd",
      "/var/log",
      "/var/cache",
      "/srv/aialra/apps/codexapp/state",
      "/srv/aialra/backups",
      "/home",
    ].join(" "),
)
  .split(/\s+/)
  .map((value) => value.trim())
  .filter(Boolean);
const ephemeralImageRepositories = String(
  process.env.ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES ||
    "roompire-migrator",
)
  .split(/\s+/)
  .filter(Boolean);

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    encoding: "utf8",
    env: process.env,
    timeout: options.timeoutMs,
  });

  if (result.error) {
    return { ok: false, stdout: result.stdout || "", error: result.error.message };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout || "",
      error: (result.stderr || result.stdout || `exit ${result.status}`).trim(),
    };
  }

  return { ok: true, stdout: result.stdout || "", error: null };
}

function parseSystemctlShow(output) {
  const values = {};

  for (const line of output.split("\n")) {
    const separator = line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    values[line.slice(0, separator)] = line.slice(separator + 1);
  }

  return values;
}

function nullableSystemdValue(value) {
  return value && value !== "n/a" ? value : null;
}

function collectSystemdTimer(timerName) {
  const result = command("systemctl", [
    "show",
    timerName,
    "--property=ActiveState",
    "--property=UnitFileState",
    "--property=NextElapseUSecRealtime",
    "--property=LastTriggerUSecRealtime",
  ]);

  if (!result.ok) {
    return {
      name: timerName,
      activeState: "unknown",
      enabledState: "unknown",
      nextElapse: null,
      lastTrigger: null,
      status: "unknown",
      error: result.error,
    };
  }

  const values = parseSystemctlShow(result.stdout);
  const activeState = values.ActiveState || "unknown";
  const enabledState = values.UnitFileState || "unknown";

  return {
    name: timerName,
    activeState,
    enabledState,
    nextElapse: nullableSystemdValue(values.NextElapseUSecRealtime),
    lastTrigger: nullableSystemdValue(values.LastTriggerUSecRealtime),
    status: activeState === "active" && enabledState === "enabled" ? "ok" : "warning",
    error: null,
  };
}

function collectSystemdService(serviceName) {
  const result = command("systemctl", [
    "show",
    serviceName,
    "--property=ActiveState",
    "--property=Result",
    "--property=ExecMainStatus",
    "--property=ExecMainStartTimestamp",
    "--property=ExecMainExitTimestamp",
  ]);

  if (!result.ok) {
    return {
      name: serviceName,
      activeState: "unknown",
      result: "unknown",
      execMainStatus: "unknown",
      startedAt: null,
      finishedAt: null,
      status: "unknown",
      error: result.error,
    };
  }

  const values = parseSystemctlShow(result.stdout);
  const serviceResult = values.Result || "unknown";

  return {
    name: serviceName,
    activeState: values.ActiveState || "unknown",
    result: serviceResult,
    execMainStatus: values.ExecMainStatus || "unknown",
    startedAt: nullableSystemdValue(values.ExecMainStartTimestamp),
    finishedAt: nullableSystemdValue(values.ExecMainExitTimestamp),
    status: serviceResult === "success" ? "ok" : "warning",
    error: null,
  };
}

function collectBackupTimer() {
  return collectSystemdTimer(backupTimerName);
}

function collectBackupService() {
  return collectSystemdService(backupServiceName);
}

function collectOpsStatusTimer() {
  return collectSystemdTimer(opsStatusTimerName);
}

function collectOpsStatusService() {
  return collectSystemdService(opsStatusServiceName);
}

function collectSmokeTimer() {
  return collectSystemdTimer(smokeTimerName);
}

function collectSmokeService() {
  return collectSystemdService(smokeServiceName);
}

function collectReminderTimer() {
  return collectSystemdTimer(reminderTimerName);
}

function collectReminderService() {
  return collectSystemdService(reminderServiceName);
}

function collectHousekeepingTimer() {
  return collectSystemdTimer(housekeepingTimerName);
}

function collectHousekeepingService() {
  return collectSystemdService(housekeepingServiceName);
}

function parseUnitEnvironment(output) {
  const values = {};

  for (const part of output.trim().split(/\s+/).filter(Boolean)) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    values[part.slice(0, separator)] = part.slice(separator + 1);
  }

  return values;
}

function healthStateValue(value) {
  return ["ok", "warning", "unknown"].includes(value) ? value : "unknown";
}

function backupOffsiteModeValue(value) {
  return ["disabled", "local", "rclone"].includes(value) ? value : "unknown";
}

function finiteNumberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function positiveIntegerValue(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function parseDockerSize(value) {
  const match = String(value || "")
    .trim()
    .match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMGTPE]?B)$/i);

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
    PB: 1024 ** 5,
    EB: 1024 ** 6,
  };

  return Number.isFinite(amount) ? Math.round(amount * (multipliers[unit] || 1)) : 0;
}

function parseDockerReclaimable(value) {
  const text = String(value || "").trim();
  const sizeMatch = text.match(/^([^(]+)/);
  const percentMatch = text.match(/\((\d+)%\)/);

  return {
    bytes: parseDockerSize(sizeMatch?.[1] || text),
    percent: percentMatch ? Number(percentMatch[1]) : null,
  };
}

function emptyDockerStorageCategory() {
  return {
    totalCount: 0,
    activeCount: 0,
    sizeBytes: 0,
    reclaimableBytes: 0,
    reclaimablePercent: null,
  };
}

function walkBackupFiles(root) {
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  walk(root);

  return files;
}

function backupTimestamp(file) {
  return path.basename(file).match(/(\d{8}T\d{6}Z)/)?.[1] || "";
}

function backupTimestampToIso(timestamp) {
  const match = timestamp.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
  );

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
}

function latestBackupArtifact(files, pattern) {
  return (
    files
      .filter((file) => pattern.test(path.basename(file)))
      .map((file) => {
        const timestamp = backupTimestamp(file);

        return {
          file,
          timestamp,
          checkedAt: backupTimestampToIso(timestamp),
        };
      })
      .filter((artifact) => artifact.checkedAt !== null)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0] ?? null
  );
}

function collectBackupFreshness() {
  const base = {
    backupRoot,
    staleMs: backupFreshnessStaleMs,
    checkedAt: generatedAt,
  };

  try {
    if (!fs.existsSync(backupRoot)) {
      return {
        ...base,
        latestCompleteBackupAt: null,
        latestPostgresArtifact: null,
        latestPostgresAt: null,
        latestUploadsArtifact: null,
        latestUploadsAt: null,
        latestFileManifestArtifact: null,
        latestFileManifestAt: null,
        status: "unknown",
        error: "Backup root does not exist.",
      };
    }

    const files = walkBackupFiles(backupRoot);
    const latestPostgres = latestBackupArtifact(
      files,
      /^roompire_\d{8}T\d{6}Z\.dump(?:\.enc)?$/,
    );
    const latestUploads = latestBackupArtifact(
      files,
      /^roompire_uploads_\d{8}T\d{6}Z\.tar\.gz(?:\.enc)?$/,
    );
    const latestFileManifest = latestBackupArtifact(
      files,
      /^roompire_file_manifest_\d{8}T\d{6}Z\.json(?:\.enc)?$/,
    );
    const artifactTimes = [
      latestPostgres?.checkedAt,
      latestUploads?.checkedAt,
      latestFileManifest?.checkedAt,
    ].filter(Boolean);
    const latestCompleteBackupAt =
      artifactTimes.length === 3
        ? artifactTimes.sort((left, right) => Date.parse(left) - Date.parse(right))[0]
        : null;
    const errors = [];

    if (!latestPostgres) {
      errors.push("No PostgreSQL backup artifact was found.");
    }

    if (!latestUploads) {
      errors.push("No upload-volume backup artifact was found.");
    }

    if (!latestFileManifest) {
      errors.push("No file-manifest backup artifact was found.");
    }

    if (latestCompleteBackupAt) {
      const completeBackupMs = Date.parse(latestCompleteBackupAt);

      if (
        !Number.isFinite(completeBackupMs) ||
        Date.now() - completeBackupMs > backupFreshnessStaleMs
      ) {
        errors.push("Latest complete backup set is stale.");
      }
    }

    return {
      ...base,
      latestCompleteBackupAt,
      latestPostgresArtifact: latestPostgres?.file ?? null,
      latestPostgresAt: latestPostgres?.checkedAt ?? null,
      latestUploadsArtifact: latestUploads?.file ?? null,
      latestUploadsAt: latestUploads?.checkedAt ?? null,
      latestFileManifestArtifact: latestFileManifest?.file ?? null,
      latestFileManifestAt: latestFileManifest?.checkedAt ?? null,
      status: errors.length > 0 ? "warning" : "ok",
      error: errors.join("; ") || null,
    };
  } catch (error) {
    return {
      ...base,
      latestCompleteBackupAt: null,
      latestPostgresArtifact: null,
      latestPostgresAt: null,
      latestUploadsArtifact: null,
      latestUploadsAt: null,
      latestFileManifestArtifact: null,
      latestFileManifestAt: null,
      status: "unknown",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectBackupEncryption() {
  const serviceEnvResult = command("systemctl", [
    "show",
    backupServiceName,
    "--property=Environment",
    "--value",
  ]);
  const serviceEnv = serviceEnvResult.ok ? parseUnitEnvironment(serviceEnvResult.stdout) : {};
  const configured = ["enabled", "disabled"].includes(serviceEnv.ROOMPIRE_BACKUP_ENCRYPTION)
    ? serviceEnv.ROOMPIRE_BACKUP_ENCRYPTION
    : "unknown";
  const passphraseFile = serviceEnv.ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE || "";
  const passphraseFileConfigured = passphraseFile.length > 0;
  const passphraseFileExists = passphraseFileConfigured ? fs.existsSync(passphraseFile) : null;

  try {
    if (!fs.existsSync(backupRoot)) {
      return {
        backupRoot,
        configured,
        passphraseFileConfigured,
        passphraseFileExists,
        encryptedArtifacts: 0,
        plaintextArtifacts: 0,
        missingSha256Sidecars: 0,
        latestEncryptedArtifact: null,
        status: "unknown",
        checkedAt: generatedAt,
        error: "Backup root does not exist.",
      };
    }

    const files = walkBackupFiles(backupRoot);
    const encryptedFiles = files.filter((file) => {
      const base = path.basename(file);

      return (
        /^roompire_\d{8}T\d{6}Z\.dump\.enc$/.test(base) ||
        /^roompire_uploads_\d{8}T\d{6}Z\.tar\.gz\.enc$/.test(base) ||
        /^roompire_file_manifest_\d{8}T\d{6}Z\.json\.enc$/.test(base)
      );
    });
    const plaintextFiles = files.filter((file) => {
      const base = path.basename(file);

      return (
        /^roompire_\d{8}T\d{6}Z\.dump$/.test(base) ||
        /^roompire_uploads_\d{8}T\d{6}Z\.tar\.gz$/.test(base) ||
        /^roompire_file_manifest_\d{8}T\d{6}Z\.json$/.test(base)
      );
    });
    const missingSidecars = encryptedFiles.filter((file) => !fs.existsSync(`${file}.sha256`));
    const latestEncryptedArtifact =
      encryptedFiles
        .map((file) => ({ file, timestamp: backupTimestamp(file) }))
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0]?.file ?? null;
    const status =
      configured === "enabled" &&
      passphraseFileConfigured &&
      passphraseFileExists !== false &&
      encryptedFiles.length > 0 &&
      plaintextFiles.length === 0 &&
      missingSidecars.length === 0
        ? "ok"
        : "warning";

    return {
      backupRoot,
      configured,
      passphraseFileConfigured,
      passphraseFileExists,
      encryptedArtifacts: encryptedFiles.length,
      plaintextArtifacts: plaintextFiles.length,
      missingSha256Sidecars: missingSidecars.length,
      latestEncryptedArtifact,
      status,
      checkedAt: generatedAt,
      error: serviceEnvResult.ok ? null : serviceEnvResult.error,
    };
  } catch (error) {
    return {
      backupRoot,
      configured,
      passphraseFileConfigured,
      passphraseFileExists,
      encryptedArtifacts: 0,
      plaintextArtifacts: 0,
      missingSha256Sidecars: 0,
      latestEncryptedArtifact: null,
      status: "unknown",
      checkedAt: generatedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectBackupPassphraseEscrow() {
  const base = {
    statusFile: backupPassphraseEscrowStatusPath,
    staleMs: backupPassphraseEscrowStaleMs,
    checkedAt: generatedAt,
  };

  if (!fs.existsSync(backupPassphraseEscrowStatusPath)) {
    return {
      ...base,
      configured: false,
      method: null,
      custodian: null,
      recordedAt: null,
      lastVerifiedAt: null,
      status: "warning",
      error: "Backup passphrase escrow has not been recorded.",
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(backupPassphraseEscrowStatusPath, "utf8"));
    const method = typeof parsed.method === "string" && parsed.method ? parsed.method : null;
    const custodian =
      typeof parsed.custodian === "string" && parsed.custodian ? parsed.custodian : null;
    const recordedAt = typeof parsed.generatedAt === "string" ? parsed.generatedAt : null;
    const lastVerifiedAt =
      typeof parsed.lastVerifiedAt === "string" ? parsed.lastVerifiedAt : recordedAt;
    const errors = [];
    const lastVerifiedMs = lastVerifiedAt ? Date.parse(lastVerifiedAt) : Number.NaN;

    if (!method) {
      errors.push("Backup passphrase escrow method is not recorded.");
    }

    if (!lastVerifiedAt || !Number.isFinite(lastVerifiedMs)) {
      errors.push("Backup passphrase escrow verification time is not recorded.");
    } else if (Date.now() - lastVerifiedMs > backupPassphraseEscrowStaleMs) {
      errors.push("Backup passphrase escrow verification is stale.");
    }

    if (typeof parsed.error === "string" && parsed.error) {
      errors.push(parsed.error);
    }

    return {
      ...base,
      configured: true,
      method,
      custodian,
      recordedAt,
      lastVerifiedAt,
      status: errors.length > 0 ? "warning" : healthStateValue(parsed.status),
      error: errors.join("; ") || null,
    };
  } catch (error) {
    return {
      ...base,
      configured: true,
      method: null,
      custodian: null,
      recordedAt: null,
      lastVerifiedAt: null,
      status: "unknown",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectBackupOffsite() {
  const serviceEnvResult = command("systemctl", [
    "show",
    backupServiceName,
    "--property=Environment",
    "--value",
  ]);
  const serviceEnv = serviceEnvResult.ok ? parseUnitEnvironment(serviceEnvResult.stdout) : {};
  const mode = backupOffsiteModeValue(
    serviceEnv.ROOMPIRE_BACKUP_OFFSITE_MODE ||
      process.env.ROOMPIRE_BACKUP_OFFSITE_MODE ||
      "disabled",
  );
  const localTarget =
    serviceEnv.ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR ||
    process.env.ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR ||
    "";
  const rcloneRemote =
    serviceEnv.ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE ||
    process.env.ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE ||
    "";
  const statusPath =
    serviceEnv.ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE ||
    process.env.ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE ||
    backupOffsiteStatusPath;
  const configured = mode === "local" || mode === "rclone";
  const target =
    mode === "local" && localTarget
      ? `local:${path.resolve(localTarget)}`
      : mode === "rclone" && rcloneRemote
        ? `rclone:${rcloneRemote}`
        : null;
  const targetConfigured = target !== null;

  if (!configured) {
    return {
      mode,
      configured: false,
      targetConfigured: false,
      target: null,
      statusFile: statusPath,
      lastSyncAt: null,
      artifactCount: 0,
      totalBytes: 0,
      latestArtifact: null,
      sourceDeviceId: null,
      targetDeviceId: null,
      sameFilesystem: null,
      sameFilesystemAllowed: false,
      status: mode === "disabled" ? "warning" : "unknown",
      checkedAt: generatedAt,
      error: serviceEnvResult.ok
        ? mode === "disabled"
          ? null
          : "Offsite backup mode is not readable."
        : serviceEnvResult.error,
    };
  }

  if (!targetConfigured) {
    return {
      mode,
      configured: true,
      targetConfigured: false,
      target: null,
      statusFile: statusPath,
      lastSyncAt: null,
      artifactCount: 0,
      totalBytes: 0,
      latestArtifact: null,
      sourceDeviceId: null,
      targetDeviceId: null,
      sameFilesystem: null,
      sameFilesystemAllowed: false,
      status: "warning",
      checkedAt: generatedAt,
      error:
        mode === "local"
          ? "ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR is not configured."
          : "ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE is not configured.",
    };
  }

  if (!fs.existsSync(statusPath)) {
    return {
      mode,
      configured: true,
      targetConfigured: true,
      target,
      statusFile: statusPath,
      lastSyncAt: null,
      artifactCount: 0,
      totalBytes: 0,
      latestArtifact: null,
      sourceDeviceId: null,
      targetDeviceId: null,
      sameFilesystem: null,
      sameFilesystemAllowed: false,
      status: "warning",
      checkedAt: generatedAt,
      error: "Offsite backup sync has not written a status file.",
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    const statusMode = backupOffsiteModeValue(parsed.mode);
    const statusTarget = typeof parsed.target === "string" && parsed.target ? parsed.target : target;
    const errors = [];

    if (statusMode !== "unknown" && statusMode !== mode) {
      errors.push("Offsite backup status mode does not match the backup unit configuration.");
    }

    if (typeof parsed.error === "string" && parsed.error) {
      errors.push(parsed.error);
    }

    if (!serviceEnvResult.ok) {
      errors.push(serviceEnvResult.error);
    }

    return {
      mode,
      configured: true,
      targetConfigured: true,
      target: statusTarget,
      statusFile: statusPath,
      lastSyncAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      artifactCount: finiteNumberValue(parsed.artifactCount),
      totalBytes: finiteNumberValue(parsed.totalBytes),
      latestArtifact: typeof parsed.latestArtifact === "string" ? parsed.latestArtifact : null,
      sourceDeviceId:
        typeof parsed.sourceDeviceId === "string" && parsed.sourceDeviceId
          ? parsed.sourceDeviceId
          : null,
      targetDeviceId:
        typeof parsed.targetDeviceId === "string" && parsed.targetDeviceId
          ? parsed.targetDeviceId
          : null,
      sameFilesystem: typeof parsed.sameFilesystem === "boolean" ? parsed.sameFilesystem : null,
      sameFilesystemAllowed: parsed.sameFilesystemAllowed === true,
      status:
        errors.length > 0 || statusMode !== mode ? "warning" : healthStateValue(parsed.status),
      checkedAt: generatedAt,
      error: errors.join("; ") || null,
    };
  } catch (error) {
    return {
      mode,
      configured: true,
      targetConfigured: true,
      target,
      statusFile: statusPath,
      lastSyncAt: null,
      artifactCount: 0,
      totalBytes: 0,
      latestArtifact: null,
      sourceDeviceId: null,
      targetDeviceId: null,
      sameFilesystem: null,
      sameFilesystemAllowed: false,
      status: "unknown",
      checkedAt: generatedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectDisk() {
  const result = command("df", ["-P", "-B1", diskPath]);

  if (!result.ok) {
    return {
      path: diskPath,
      sizeBytes: null,
      usedBytes: null,
      availableBytes: null,
      usedPercent: null,
      status: "unknown",
      checkedAt: generatedAt,
      error: result.error,
    };
  }

  const line = result.stdout.trim().split("\n")[1] || "";
  const columns = line.trim().split(/\s+/);
  const sizeBytes = Number(columns[1]);
  const usedBytes = Number(columns[2]);
  const availableBytes = Number(columns[3]);
  const usedPercent = Number(String(columns[4] || "").replace("%", ""));
  const valid =
    Number.isFinite(sizeBytes) &&
    Number.isFinite(usedBytes) &&
    Number.isFinite(availableBytes) &&
    Number.isFinite(usedPercent);

  if (!valid) {
    return {
      path: diskPath,
      sizeBytes: null,
      usedBytes: null,
      availableBytes: null,
      usedPercent: null,
      status: "unknown",
      checkedAt: generatedAt,
      error: "Could not parse df output.",
    };
  }

  return {
    path: diskPath,
    sizeBytes,
    usedBytes,
    availableBytes,
    usedPercent,
    status:
      availableBytes < diskWarningAvailableBytes || usedPercent >= 90 ? "warning" : "ok",
    checkedAt: generatedAt,
    error: null,
  };
}

function collectDeploymentHeadroom(disk) {
  const availableBytes =
    Number.isFinite(disk.availableBytes) && disk.availableBytes >= 0 ? disk.availableBytes : null;
  const missingBytes =
    availableBytes === null ? null : Math.max(deployMinAvailableBytes - availableBytes, 0);

  return {
    requiredAvailableBytes: deployMinAvailableBytes,
    availableBytes,
    missingBytes,
    status: availableBytes === null ? "unknown" : missingBytes > 0 ? "warning" : "ok",
    checkedAt: disk.checkedAt || generatedAt,
    error: availableBytes === null ? disk.error || "Disk available bytes could not be read." : null,
  };
}

function collectRootStorageInventory() {
  const topLimit = positiveIntegerValue(rootStorageInventoryLimit, 8);
  const timeoutMs = positiveIntegerValue(rootStorageInventoryTimeoutMs, 30000);
  const paths = [...new Set(rootStorageInventoryPaths)].filter((inventoryPath) =>
    path.isAbsolute(inventoryPath),
  );

  if (paths.length === 0) {
    return {
      topLimit,
      timeoutMs,
      totalBytes: 0,
      paths: [],
      status: "unknown",
      checkedAt: generatedAt,
      error: "No absolute root storage inventory paths are configured.",
    };
  }

  const result = command("du", ["-x", "-s", "-B1", "--", ...paths], { timeoutMs });
  const items = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("\t");
      const sizeText = separator === -1 ? line.trim().split(/\s+/)[0] : line.slice(0, separator);
      const itemPath =
        separator === -1
          ? line.trim().split(/\s+/).slice(1).join(" ")
          : line.slice(separator + 1).trim();
      const sizeBytes = Number(sizeText);

      if (!Number.isFinite(sizeBytes) || !itemPath) {
        return null;
      }

      return {
        path: itemPath,
        sizeBytes,
      };
    })
    .filter((item) => item !== null)
    .sort((left, right) => right.sizeBytes - left.sizeBytes);
  const totalBytes = items.reduce((total, item) => total + item.sizeBytes, 0);

  return {
    topLimit,
    timeoutMs,
    totalBytes,
    paths: items.slice(0, topLimit),
    status: result.ok ? "ok" : items.length > 0 ? "warning" : "unknown",
    checkedAt: generatedAt,
    error: result.ok ? null : result.error,
  };
}

function sharedAppStorageStateValue(value) {
  return ["ok", "warning", "unknown"].includes(value) ? value : "unknown";
}

function normalizeSharedAppStoragePath(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const itemPath = typeof value.path === "string" ? value.path : "";
  const sizeBytes = Number(value.sizeBytes);

  if (!itemPath || !Number.isFinite(sizeBytes)) {
    return null;
  }

  return {
    path: itemPath,
    sizeBytes,
  };
}

function normalizeSharedAppStorageError(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const itemPath = typeof value.path === "string" ? value.path : "";
  const message = typeof value.message === "string" ? value.message : "";

  if (!itemPath || !message) {
    return null;
  }

  return {
    path: itemPath,
    message,
  };
}

function readSharedAppStorageInventory() {
  try {
    if (!fs.existsSync(sharedAppStorageStatusPath)) {
      return {
        status: "unknown",
        statusFile: sharedAppStorageStatusPath,
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

    const parsed = JSON.parse(fs.readFileSync(sharedAppStorageStatusPath, "utf8"));
    const roots = Array.isArray(parsed.roots)
      ? parsed.roots.filter((value) => typeof value === "string")
      : [];
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.map(normalizeSharedAppStoragePath).filter((value) => value !== null)
      : [];
    const timedOutPaths = Array.isArray(parsed.timedOutPaths)
      ? parsed.timedOutPaths.filter((value) => typeof value === "string")
      : [];
    const skippedPaths = Array.isArray(parsed.skippedPaths)
      ? parsed.skippedPaths.filter((value) => typeof value === "string")
      : [];
    const errors = Array.isArray(parsed.errors)
      ? parsed.errors.map(normalizeSharedAppStorageError).filter((value) => value !== null)
      : [];
    const topLimit = Number(parsed.topLimit);
    const totalTimeoutMs = Number(parsed.totalTimeoutMs);
    const pathTimeoutMs = Number(parsed.pathTimeoutMs);
    const totalBytes = Number(parsed.totalBytes);

    return {
      status: sharedAppStorageStateValue(parsed.status),
      statusFile: sharedAppStorageStatusPath,
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      roots,
      topLimit: Number.isFinite(topLimit) ? topLimit : 12,
      totalTimeoutMs: Number.isFinite(totalTimeoutMs) ? totalTimeoutMs : 240000,
      pathTimeoutMs: Number.isFinite(pathTimeoutMs) ? pathTimeoutMs : 45000,
      totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
      paths,
      skippedPaths,
      timedOutPaths,
      errors,
      checkedAt: typeof parsed.checkedAt === "string" ? parsed.checkedAt : null,
      error: typeof parsed.error === "string" ? parsed.error : null,
    };
  } catch (error) {
    return {
      status: "unknown",
      statusFile: sharedAppStorageStatusPath,
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function diskHistorySampleFromDisk(disk) {
  if (
    disk.sizeBytes === null ||
    disk.usedBytes === null ||
    disk.availableBytes === null ||
    disk.usedPercent === null ||
    !disk.checkedAt
  ) {
    return null;
  }

  return {
    checkedAt: disk.checkedAt,
    path: disk.path,
    sizeBytes: disk.sizeBytes,
    usedBytes: disk.usedBytes,
    availableBytes: disk.availableBytes,
    usedPercent: disk.usedPercent,
  };
}

function normalizeDiskHistorySample(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const checkedAt = typeof value.checkedAt === "string" ? value.checkedAt : "";
  const checkedAtMs = Date.parse(checkedAt);
  const samplePath = typeof value.path === "string" && value.path ? value.path : diskPath;
  const sizeBytes = Number(value.sizeBytes);
  const usedBytes = Number(value.usedBytes);
  const availableBytes = Number(value.availableBytes);
  const usedPercent = Number(value.usedPercent);

  if (
    !Number.isFinite(checkedAtMs) ||
    !Number.isFinite(sizeBytes) ||
    !Number.isFinite(usedBytes) ||
    !Number.isFinite(availableBytes) ||
    !Number.isFinite(usedPercent)
  ) {
    return null;
  }

  return {
    checkedAt,
    path: samplePath,
    sizeBytes,
    usedBytes,
    availableBytes,
    usedPercent,
  };
}

function readDiskHistorySamples() {
  if (!fs.existsSync(diskHistoryPath)) {
    return { samples: [], error: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(diskHistoryPath, "utf8"));
    const rawSamples = Array.isArray(parsed) ? parsed : Array.isArray(parsed.samples) ? parsed.samples : [];

    return {
      samples: rawSamples.map(normalizeDiskHistorySample).filter((sample) => sample !== null),
      error: null,
    };
  } catch (error) {
    return {
      samples: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeDiskHistorySamples(samples) {
  const payload = {
    schemaVersion: 1,
    generatedAt,
    maxSamples: positiveIntegerValue(diskHistoryMaxSamples, 672),
    samples,
  };

  fs.mkdirSync(path.dirname(diskHistoryPath), { recursive: true });
  const tmpPath = `${diskHistoryPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
  fs.renameSync(tmpPath, diskHistoryPath);
}

function collectDiskTrend(disk) {
  const history = readDiskHistorySamples();
  const currentSample = diskHistorySampleFromDisk(disk);
  const maxSamples = positiveIntegerValue(diskHistoryMaxSamples, 672);
  let samples = history.samples;
  let writeError = null;

  if (currentSample) {
    samples = samples
      .filter(
        (sample) =>
          !(sample.path === currentSample.path && sample.checkedAt === currentSample.checkedAt),
      )
      .concat(currentSample)
      .sort((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt))
      .slice(-maxSamples);

    try {
      writeDiskHistorySamples(samples);
    } catch (error) {
      writeError = error instanceof Error ? error.message : String(error);
    }
  }

  const pathSamples = samples
    .filter((sample) => sample.path === disk.path)
    .sort((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt));
  const newest = pathSamples[pathSamples.length - 1] ?? null;
  const oldest = pathSamples[0] ?? null;
  const historyError = history.error || writeError;

  if (!oldest || !newest || pathSamples.length < 2) {
    return {
      status: "unknown",
      historyFile: diskHistoryPath,
      sampleCount: pathSamples.length,
      oldestCheckedAt: oldest?.checkedAt ?? null,
      newestCheckedAt: newest?.checkedAt ?? null,
      windowHours: null,
      availableChangeBytes: null,
      usedChangeBytes: null,
      usedPercentChange: null,
      averageUsedBytesPerDay: null,
      estimatedDaysUntilFull: null,
      warningDays: Number.isFinite(diskTrendWarningDays) ? diskTrendWarningDays : 14,
      minimumWindowHours: Number.isFinite(diskTrendMinimumWindowHours)
        ? diskTrendMinimumWindowHours
        : 6,
      checkedAt: generatedAt,
      error: historyError || "Not enough disk history samples yet.",
    };
  }

  const windowHours =
    Math.round(((Date.parse(newest.checkedAt) - Date.parse(oldest.checkedAt)) / 3600000) * 10) / 10;

  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    return {
      status: "unknown",
      historyFile: diskHistoryPath,
      sampleCount: pathSamples.length,
      oldestCheckedAt: oldest.checkedAt,
      newestCheckedAt: newest.checkedAt,
      windowHours: null,
      availableChangeBytes: null,
      usedChangeBytes: null,
      usedPercentChange: null,
      averageUsedBytesPerDay: null,
      estimatedDaysUntilFull: null,
      warningDays: Number.isFinite(diskTrendWarningDays) ? diskTrendWarningDays : 14,
      minimumWindowHours: Number.isFinite(diskTrendMinimumWindowHours)
        ? diskTrendMinimumWindowHours
        : 6,
      checkedAt: generatedAt,
      error: historyError || "Disk history samples have no usable time window.",
    };
  }

  const availableChangeBytes = newest.availableBytes - oldest.availableBytes;
  const usedChangeBytes = newest.usedBytes - oldest.usedBytes;
  const usedPercentChange = Math.round((newest.usedPercent - oldest.usedPercent) * 10) / 10;
  const averageUsedBytesPerDay = Math.round((usedChangeBytes / windowHours) * 24);
  const minimumWindowHours = Number.isFinite(diskTrendMinimumWindowHours)
    ? diskTrendMinimumWindowHours
    : 6;

  if (windowHours < minimumWindowHours) {
    return {
      status: "unknown",
      historyFile: diskHistoryPath,
      sampleCount: pathSamples.length,
      oldestCheckedAt: oldest.checkedAt,
      newestCheckedAt: newest.checkedAt,
      windowHours,
      availableChangeBytes,
      usedChangeBytes,
      usedPercentChange,
      averageUsedBytesPerDay,
      estimatedDaysUntilFull: null,
      warningDays: Number.isFinite(diskTrendWarningDays) ? diskTrendWarningDays : 14,
      minimumWindowHours,
      checkedAt: generatedAt,
      error: `Disk history window is below the ${minimumWindowHours}h minimum trend window.`,
    };
  }

  const estimatedDaysUntilFull =
    averageUsedBytesPerDay > 0 && newest.availableBytes > 0
      ? Math.round((newest.availableBytes / averageUsedBytesPerDay) * 10) / 10
      : null;
  const warningDays = Number.isFinite(diskTrendWarningDays) ? diskTrendWarningDays : 14;

  return {
    status:
      estimatedDaysUntilFull !== null && estimatedDaysUntilFull <= warningDays ? "warning" : "ok",
    historyFile: diskHistoryPath,
    sampleCount: pathSamples.length,
    oldestCheckedAt: oldest.checkedAt,
    newestCheckedAt: newest.checkedAt,
    windowHours,
    availableChangeBytes,
    usedChangeBytes,
    usedPercentChange,
    averageUsedBytesPerDay,
    estimatedDaysUntilFull,
    warningDays,
    minimumWindowHours,
    checkedAt: generatedAt,
    error: historyError,
  };
}

function collectDockerStorage(dockerImageInventory) {
  const result = command("docker", ["system", "df", "--format", "{{json .}}"]);

  if (!result.ok) {
    return {
      images: emptyDockerStorageCategory(),
      containers: emptyDockerStorageCategory(),
      localVolumes: emptyDockerStorageCategory(),
      buildCache: emptyDockerStorageCategory(),
      totalReclaimableBytes: 0,
      safeReclaimableBytes: 0,
      unsafeReclaimableBytes: 0,
      reclaimableWarningBytes: dockerReclaimableWarningBytes,
      status: "unknown",
      checkedAt: generatedAt,
      error: result.error,
    };
  }

  const categories = {
    images: emptyDockerStorageCategory(),
    containers: emptyDockerStorageCategory(),
    localVolumes: emptyDockerStorageCategory(),
    buildCache: emptyDockerStorageCategory(),
  };

  try {
    for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
      const parsed = JSON.parse(line);
      const type = String(parsed.Type || "");
      const reclaimable = parseDockerReclaimable(parsed.Reclaimable);
      const category = {
        totalCount: Number(parsed.TotalCount || 0),
        activeCount: Number(parsed.Active || 0),
        sizeBytes: parseDockerSize(parsed.Size),
        reclaimableBytes: reclaimable.bytes,
        reclaimablePercent: reclaimable.percent,
      };

      if (type === "Images") {
        categories.images = category;
      } else if (type === "Containers") {
        categories.containers = category;
      } else if (type === "Local Volumes") {
        categories.localVolumes = category;
      } else if (type === "Build Cache") {
        categories.buildCache = category;
      }
    }
  } catch (error) {
    return {
      images: emptyDockerStorageCategory(),
      containers: emptyDockerStorageCategory(),
      localVolumes: emptyDockerStorageCategory(),
      buildCache: emptyDockerStorageCategory(),
      totalReclaimableBytes: 0,
      safeReclaimableBytes: 0,
      unsafeReclaimableBytes: 0,
      reclaimableWarningBytes: dockerReclaimableWarningBytes,
      status: "unknown",
      checkedAt: generatedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const totalReclaimableBytes =
    categories.images.reclaimableBytes +
    categories.containers.reclaimableBytes +
    categories.localVolumes.reclaimableBytes +
    categories.buildCache.reclaimableBytes;
  const safeImageReclaimableBytes =
    dockerImageInventory.status === "ok" ? dockerImageInventory.safeReclaimableImageBytes : 0;
  const safeReclaimableBytes = categories.buildCache.sizeBytes + safeImageReclaimableBytes;
  const unsafeReclaimableBytes = Math.max(totalReclaimableBytes - safeReclaimableBytes, 0);

  return {
    ...categories,
    totalReclaimableBytes,
    safeReclaimableBytes,
    unsafeReclaimableBytes,
    reclaimableWarningBytes: dockerReclaimableWarningBytes,
    status: safeReclaimableBytes >= dockerReclaimableWarningBytes ? "warning" : "ok",
    checkedAt: generatedAt,
    error: null,
  };
}

function isDanglingDockerImage(image) {
  return image.repository === "<none>" || image.tag === "<none>";
}

function isEphemeralImageCandidate(image) {
  return ephemeralImageRepositories.includes(image.repository);
}

function isSafeImageReclaimableCandidate(image) {
  return (
    image.containers === 0 &&
    (isDanglingDockerImage(image) || isEphemeralImageCandidate(image))
  );
}

function collectDockerImageInventory() {
  const result = command("docker", ["image", "ls", "--format", "{{json .}}"]);
  const topLimit = positiveIntegerValue(dockerImageInventoryLimit, 8);

  if (!result.ok) {
    return {
      topLimit,
      totalImageBytes: 0,
      images: [],
      activeImageBytes: 0,
      inactiveImageBytes: 0,
      safeReclaimableImageBytes: 0,
      reclaimableCandidates: [],
      status: "unknown",
      checkedAt: generatedAt,
      error: result.error,
    };
  }

  try {
    const images = result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parsed = JSON.parse(line);
        const repository = String(parsed.Repository || "<none>");
        const tag = String(parsed.Tag || "<none>");
        const imageId = String(parsed.ID || "");
        const containers = Number(parsed.Containers || 0);

        return {
          repository,
          tag,
          imageId,
          reference: `${repository}:${tag}`,
          sizeBytes: parseDockerSize(parsed.Size),
          containers: Number.isFinite(containers) ? containers : 0,
          createdAt: typeof parsed.CreatedAt === "string" ? parsed.CreatedAt : null,
        };
      });
    const totalImageBytes = images.reduce((total, image) => total + image.sizeBytes, 0);
    const activeImageBytes = images
      .filter((image) => image.containers > 0)
      .reduce((total, image) => total + image.sizeBytes, 0);
    const inactiveImageBytes = images
      .filter((image) => image.containers === 0)
      .reduce((total, image) => total + image.sizeBytes, 0);
    const allReclaimableCandidates = images
      .filter(isSafeImageReclaimableCandidate)
      .sort((left, right) => right.sizeBytes - left.sizeBytes);
    const reclaimableCandidates = allReclaimableCandidates.slice(0, topLimit);
    const safeReclaimableImageBytes = allReclaimableCandidates.reduce(
      (total, image) => total + image.sizeBytes,
      0,
    );

    return {
      topLimit,
      totalImageBytes,
      activeImageBytes,
      inactiveImageBytes,
      safeReclaimableImageBytes,
      images: images
        .sort((left, right) => right.sizeBytes - left.sizeBytes)
        .slice(0, topLimit),
      reclaimableCandidates,
      status: "ok",
      checkedAt: generatedAt,
      error: null,
    };
  } catch (error) {
    return {
      topLimit,
      totalImageBytes: 0,
      images: [],
      activeImageBytes: 0,
      inactiveImageBytes: 0,
      safeReclaimableImageBytes: 0,
      reclaimableCandidates: [],
      status: "unknown",
      checkedAt: generatedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function nullableDockerTimestamp(value) {
  if (typeof value !== "string" || !value || value.startsWith("0001-01-01")) {
    return null;
  }

  return Number.isFinite(Date.parse(value)) ? value : null;
}

function dockerContainerStatus(running, health) {
  if (!running) {
    return "warning";
  }

  if (health === "healthy" || health === "none") {
    return "ok";
  }

  if (health === "unknown") {
    return "unknown";
  }

  return "warning";
}

function collectContainerHealth() {
  const names = [...new Set(containerHealthNames)];

  if (names.length === 0) {
    return {
      containers: [],
      status: "unknown",
      checkedAt: generatedAt,
      error: "No production container names are configured.",
    };
  }

  const containers = names.map((containerName) => {
    const result = command("docker", ["inspect", containerName]);

    if (!result.ok) {
      return {
        name: containerName,
        image: "",
        state: "unknown",
        running: false,
        health: "unknown",
        restartCount: 0,
        startedAt: null,
        finishedAt: null,
        status: "unknown",
        error: result.error,
      };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      const container = Array.isArray(parsed) ? parsed[0] : parsed;
      const state = container && typeof container === "object" ? container.State || {} : {};
      const config = container && typeof container === "object" ? container.Config || {} : {};
      const name =
        typeof container?.Name === "string" && container.Name
          ? container.Name.replace(/^\//, "")
          : containerName;
      const running = Boolean(state.Running);
      const health =
        state.Health && typeof state.Health.Status === "string"
          ? state.Health.Status
          : "none";
      const restartCount = Number(container?.RestartCount || 0);

      return {
        name,
        image: typeof config.Image === "string" ? config.Image : "",
        state: typeof state.Status === "string" ? state.Status : "unknown",
        running,
        health,
        restartCount: Number.isFinite(restartCount) ? restartCount : 0,
        startedAt: nullableDockerTimestamp(state.StartedAt),
        finishedAt: nullableDockerTimestamp(state.FinishedAt),
        status: dockerContainerStatus(running, health),
        error: null,
      };
    } catch (error) {
      return {
        name: containerName,
        image: "",
        state: "unknown",
        running: false,
        health: "unknown",
        restartCount: 0,
        startedAt: null,
        finishedAt: null,
        status: "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const allUnknown = containers.every((container) => container.status === "unknown");
  const allOk = containers.every((container) => container.status === "ok");
  const errors = containers
    .filter((container) => container.error)
    .map((container) => `${container.name}: ${container.error}`);

  return {
    containers,
    status: allOk ? "ok" : allUnknown ? "unknown" : "warning",
    checkedAt: generatedAt,
    error: errors.join("; ") || null,
  };
}

function smokeStatusValue(value) {
  return ["passed", "failed", "missing", "unknown"].includes(value) ? value : "unknown";
}

function restoreDrillStatusValue(value) {
  return ["passed", "failed", "missing", "unknown"].includes(value) ? value : "unknown";
}

function nullableNumberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLatestSmoke() {
  if (!fs.existsSync(smokeStatusPath)) {
    return {
      status: "missing",
      generatedAt: null,
      baseUrl: null,
      checks: [],
      failedPath: null,
      message: "No production smoke-test status has been recorded yet.",
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(smokeStatusPath, "utf8"));

    return {
      status: smokeStatusValue(parsed.status),
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : null,
      checks: Array.isArray(parsed.checks) ? parsed.checks : [],
      failedPath: typeof parsed.failedPath === "string" ? parsed.failedPath : null,
      message: typeof parsed.message === "string" ? parsed.message : null,
    };
  } catch (error) {
    return {
      status: "unknown",
      generatedAt: null,
      baseUrl: null,
      checks: [],
      failedPath: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function readLatestRestoreDrill() {
  if (!fs.existsSync(restoreDrillStatusPath)) {
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

  try {
    const parsed = JSON.parse(fs.readFileSync(restoreDrillStatusPath, "utf8"));
    const auditTotal = Number(parsed.auditTotal);
    const auditHashed = Number(parsed.auditHashed);
    const auditBroken = Number(parsed.auditBroken);

    return {
      status: restoreDrillStatusValue(parsed.status),
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      backupFile: typeof parsed.backupFile === "string" ? parsed.backupFile : null,
      drillDatabase: typeof parsed.drillDatabase === "string" ? parsed.drillDatabase : null,
      auditTotal: Number.isFinite(auditTotal) ? auditTotal : null,
      auditHashed: Number.isFinite(auditHashed) ? auditHashed : null,
      auditBroken: Number.isFinite(auditBroken) ? auditBroken : null,
      message: typeof parsed.message === "string" ? parsed.message : null,
    };
  } catch (error) {
    return {
      status: "unknown",
      generatedAt: null,
      backupFile: null,
      drillDatabase: null,
      auditTotal: null,
      auditHashed: null,
      auditBroken: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function readLatestHousekeeping() {
  if (!fs.existsSync(housekeepingStatusPath)) {
    return {
      status: "unknown",
      statusFile: housekeepingStatusPath,
      generatedAt: null,
      cleanupConfirmed: false,
      message: "No housekeeping cleanup status has been recorded yet.",
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      rootPath: diskPath,
      availableBytesBefore: null,
      availableBytesAfter: null,
      reclaimedBytes: null,
      repoArtifactsMode: "unknown",
      repoArtifactMinAvailableBytes: null,
      tmpCleanupEnabled: false,
      uvCacheCleanupEnabled: false,
      nodeCacheCleanupEnabled: false,
      dockerPruneEnabled: false,
      roompireEphemeralImagesEnabled: false,
      roompireEphemeralImageRepositories: [],
      journalVacuumEnabled: false,
      browserWorkspacesMode: "unknown",
      workspaceArtifactMinAvailableBytes: null,
      checkedAt: generatedAt,
      error: "Housekeeping cleanup status has not been recorded yet.",
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(housekeepingStatusPath, "utf8"));
    const repositories = Array.isArray(parsed.roompireEphemeralImageRepositories)
      ? parsed.roompireEphemeralImageRepositories.filter((value) => typeof value === "string")
      : [];

    return {
      status: healthStateValue(parsed.status),
      statusFile: housekeepingStatusPath,
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      cleanupConfirmed: parsed.cleanupConfirmed === true,
      message: typeof parsed.message === "string" ? parsed.message : null,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
      finishedAt: typeof parsed.finishedAt === "string" ? parsed.finishedAt : null,
      exitCode: nullableNumberValue(parsed.exitCode),
      rootPath: typeof parsed.rootPath === "string" ? parsed.rootPath : diskPath,
      availableBytesBefore: nullableNumberValue(parsed.availableBytesBefore),
      availableBytesAfter: nullableNumberValue(parsed.availableBytesAfter),
      reclaimedBytes: nullableNumberValue(parsed.reclaimedBytes),
      repoArtifactsMode:
        typeof parsed.repoArtifactsMode === "string" ? parsed.repoArtifactsMode : "unknown",
      repoArtifactMinAvailableBytes: nullableNumberValue(
        parsed.repoArtifactMinAvailableBytes,
      ),
      tmpCleanupEnabled: parsed.tmpCleanupEnabled === true,
      uvCacheCleanupEnabled: parsed.uvCacheCleanupEnabled === true,
      nodeCacheCleanupEnabled: parsed.nodeCacheCleanupEnabled === true,
      dockerPruneEnabled: parsed.dockerPruneEnabled === true,
      roompireEphemeralImagesEnabled: parsed.roompireEphemeralImagesEnabled === true,
      roompireEphemeralImageRepositories: repositories,
      journalVacuumEnabled: parsed.journalVacuumEnabled === true,
      browserWorkspacesMode:
        typeof parsed.browserWorkspacesMode === "string"
          ? parsed.browserWorkspacesMode
          : "unknown",
      workspaceArtifactMinAvailableBytes: nullableNumberValue(
        parsed.workspaceArtifactMinAvailableBytes,
      ),
      checkedAt: generatedAt,
      error: typeof parsed.error === "string" ? parsed.error : null,
    };
  } catch (error) {
    return {
      status: "unknown",
      statusFile: housekeepingStatusPath,
      generatedAt: null,
      cleanupConfirmed: false,
      message: error instanceof Error ? error.message : String(error),
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      rootPath: diskPath,
      availableBytesBefore: null,
      availableBytesAfter: null,
      reclaimedBytes: null,
      repoArtifactsMode: "unknown",
      repoArtifactMinAvailableBytes: null,
      tmpCleanupEnabled: false,
      uvCacheCleanupEnabled: false,
      nodeCacheCleanupEnabled: false,
      dockerPruneEnabled: false,
      roompireEphemeralImagesEnabled: false,
      roompireEphemeralImageRepositories: [],
      journalVacuumEnabled: false,
      browserWorkspacesMode: "unknown",
      workspaceArtifactMinAvailableBytes: null,
      checkedAt: generatedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const disk = collectDisk();
const dockerImageInventory = collectDockerImageInventory();
const snapshot = {
  schemaVersion: 1,
  source: "host_status_file",
  generatedAt,
  disk,
  deploymentHeadroom: collectDeploymentHeadroom(disk),
  rootStorageInventory: collectRootStorageInventory(),
  sharedAppStorageInventory: readSharedAppStorageInventory(),
  diskTrend: collectDiskTrend(disk),
  dockerStorage: collectDockerStorage(dockerImageInventory),
  dockerImageInventory,
  containerHealth: collectContainerHealth(),
  opsStatusTimer: collectOpsStatusTimer(),
  opsStatusService: collectOpsStatusService(),
  backupTimer: collectBackupTimer(),
  backupService: collectBackupService(),
  smokeTimer: collectSmokeTimer(),
  smokeService: collectSmokeService(),
  reminderTimer: collectReminderTimer(),
  reminderService: collectReminderService(),
  housekeepingTimer: collectHousekeepingTimer(),
  housekeepingService: collectHousekeepingService(),
  backupFreshness: collectBackupFreshness(),
  backupEncryption: collectBackupEncryption(),
  backupPassphraseEscrow: collectBackupPassphraseEscrow(),
  backupOffsite: collectBackupOffsite(),
  latestSmoke: readLatestSmoke(),
  latestRestoreDrill: readLatestRestoreDrill(),
  latestHousekeeping: readLatestHousekeeping(),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const tmpPath = `${outputPath}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, outputPath);
console.log(`ok ${outputPath}`);
NODE
