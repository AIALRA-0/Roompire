#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const outputPath = process.env.ROOMPIRE_OPS_STATUS_FILE_HOST || "ops/status/ops-status.json";
const diskPath = process.env.ROOMPIRE_OPS_DISK_PATH || "/";
const backupTimerName = process.env.ROOMPIRE_BACKUP_TIMER || "roompire-backup.timer";
const backupServiceName = process.env.ROOMPIRE_BACKUP_SERVICE || "roompire-backup.service";
const housekeepingTimerName =
  process.env.ROOMPIRE_HOUSEKEEPING_TIMER || "roompire-housekeeping.timer";
const housekeepingServiceName =
  process.env.ROOMPIRE_HOUSEKEEPING_SERVICE || "roompire-housekeeping.service";
const backupRoot =
  process.env.ROOMPIRE_BACKUP_ROOT || process.env.BACKUP_ROOT || "/srv/aialra/backups/roompire";
const smokeStatusPath = process.env.ROOMPIRE_SMOKE_STATUS_FILE || "ops/status/latest-smoke.json";
const generatedAt = new Date().toISOString();
const diskWarningAvailableBytes = 5 * 1024 * 1024 * 1024;

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

const snapshot = {
  schemaVersion: 1,
  source: "host_status_file",
  generatedAt,
  disk: collectDisk(),
  backupTimer: collectBackupTimer(),
  backupService: collectBackupService(),
  housekeepingTimer: collectHousekeepingTimer(),
  housekeepingService: collectHousekeepingService(),
  backupEncryption: collectBackupEncryption(),
  latestSmoke: readLatestSmoke(),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const tmpPath = `${outputPath}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, outputPath);
console.log(`ok ${outputPath}`);
NODE
