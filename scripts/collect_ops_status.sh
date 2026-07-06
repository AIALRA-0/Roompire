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
const backupOffsiteStatusPath =
  process.env.ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE || "ops/status/backup-offsite.json";
const smokeStatusPath = process.env.ROOMPIRE_SMOKE_STATUS_FILE || "ops/status/latest-smoke.json";
const diskHistoryPath = process.env.ROOMPIRE_OPS_DISK_HISTORY_FILE || "ops/status/disk-history.json";
const generatedAt = new Date().toISOString();
const diskWarningAvailableBytes = 5 * 1024 * 1024 * 1024;
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
const ephemeralImageRepositories = String(
  process.env.ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES ||
    "roompire-migrator",
)
  .split(/\s+/)
  .filter(Boolean);

function command(commandName, args) {
  const result = spawnSync(commandName, args, {
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    return { ok: false, stdout: "", error: result.error.message };
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

function smokeStatusValue(value) {
  return ["passed", "failed", "missing", "unknown"].includes(value) ? value : "unknown";
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

const disk = collectDisk();
const dockerImageInventory = collectDockerImageInventory();
const snapshot = {
  schemaVersion: 1,
  source: "host_status_file",
  generatedAt,
  disk,
  diskTrend: collectDiskTrend(disk),
  dockerStorage: collectDockerStorage(dockerImageInventory),
  dockerImageInventory,
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
  backupEncryption: collectBackupEncryption(),
  backupOffsite: collectBackupOffsite(),
  latestSmoke: readLatestSmoke(),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const tmpPath = `${outputPath}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, outputPath);
console.log(`ok ${outputPath}`);
NODE
