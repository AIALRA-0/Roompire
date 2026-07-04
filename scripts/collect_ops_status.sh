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

function collectBackupTimer() {
  const result = command("systemctl", [
    "show",
    backupTimerName,
    "--property=ActiveState",
    "--property=UnitFileState",
    "--property=NextElapseUSecRealtime",
    "--property=LastTriggerUSecRealtime",
  ]);

  if (!result.ok) {
    return {
      name: backupTimerName,
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
    name: backupTimerName,
    activeState,
    enabledState,
    nextElapse: nullableSystemdValue(values.NextElapseUSecRealtime),
    lastTrigger: nullableSystemdValue(values.LastTriggerUSecRealtime),
    status: activeState === "active" && enabledState === "enabled" ? "ok" : "warning",
    error: null,
  };
}

function collectBackupService() {
  const result = command("systemctl", [
    "show",
    backupServiceName,
    "--property=ActiveState",
    "--property=Result",
    "--property=ExecMainStatus",
    "--property=ExecMainStartTimestamp",
    "--property=ExecMainExitTimestamp",
  ]);

  if (!result.ok) {
    return {
      name: backupServiceName,
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
    name: backupServiceName,
    activeState: values.ActiveState || "unknown",
    result: serviceResult,
    execMainStatus: values.ExecMainStatus || "unknown",
    startedAt: nullableSystemdValue(values.ExecMainStartTimestamp),
    finishedAt: nullableSystemdValue(values.ExecMainExitTimestamp),
    status: serviceResult === "success" ? "ok" : "warning",
    error: null,
  };
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
  latestSmoke: readLatestSmoke(),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const tmpPath = `${outputPath}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, outputPath);
console.log(`ok ${outputPath}`);
NODE
