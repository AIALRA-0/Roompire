import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BellRing,
  Boxes,
  CalendarDays,
  CheckCircle2,
  FileJson,
  FolderTree,
  HardDrive,
  Home,
  LineChart,
  ListChecks,
  ReceiptText,
  ServerCog,
  Settings,
  TimerReset,
  WalletCards,
  Wrench,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ApiError } from "@/server/api/errors";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { getDashboardModel } from "@/server/dashboard/model";
import { readOpsStatusForUser, type OpsStatusSnapshot } from "@/server/ops/status";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

type HealthState = OpsStatusSnapshot["summary"]["status"];
type SmokeState = OpsStatusSnapshot["latestSmoke"]["status"];
type RestoreDrillState = OpsStatusSnapshot["latestRestoreDrill"]["status"];
type BackupEncryptionMode = OpsStatusSnapshot["backupEncryption"]["configured"];
type BackupOffsiteMode = OpsStatusSnapshot["backupOffsite"]["mode"];
type DockerStorageCategory = OpsStatusSnapshot["dockerStorage"]["images"];
type DockerImageInventoryItem = OpsStatusSnapshot["dockerImageInventory"]["images"][number];
type RootStorageInventoryItem = OpsStatusSnapshot["rootStorageInventory"]["paths"][number];
type ContainerHealthItem = OpsStatusSnapshot["containerHealth"]["containers"][number];

function formatBytes(locale: Locale, bytes: number | null) {
  if (bytes === null) {
    return "—";
  }

  const gib = bytes / 1024 / 1024 / 1024;

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: gib < 10 ? 1 : 0,
  }).format(gib)} GB`;
}

function formatFileSize(locale: Locale, bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
    minimumFractionDigits: 0,
  }).format(value)} ${units[exponent]}`;
}

function formatSignedFileSize(locale: Locale, bytes: number | null) {
  if (bytes === null) {
    return "—";
  }

  if (bytes === 0) {
    return "0 B";
  }

  return `${bytes > 0 ? "+" : "-"}${formatFileSize(locale, Math.abs(bytes))}`;
}

function formatPercent(locale: Locale, value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatInteger(locale: Locale, value: number) {
  return new Intl.NumberFormat(locale).format(value);
}

function formatNullableInteger(locale: Locale, value: number | null) {
  return value === null ? "—" : formatInteger(locale, value);
}

function formatNumber(locale: Locale, value: number) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatHours(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  locale: Locale,
  value: number | null,
) {
  if (value === null) {
    return "—";
  }

  return ops("hoursValue", { count: formatNumber(locale, value) });
}

function formatDaysUntilFull(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  locale: Locale,
  value: number | null,
) {
  if (value === null) {
    return ops("trendStable");
  }

  return ops("daysValue", { count: formatNumber(locale, value) });
}

function formatPerDay(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  locale: Locale,
  value: number | null,
) {
  if (value === null) {
    return "—";
  }

  return ops("perDayValue", { value: formatSignedFileSize(locale, value) });
}

function formatReclaimable(locale: Locale, category: DockerStorageCategory) {
  const size = formatFileSize(locale, category.reclaimableBytes);

  if (category.reclaimablePercent === null) {
    return size;
  }

  return `${size} (${formatPercent(locale, category.reclaimablePercent)})`;
}

function formatDockerCategory(locale: Locale, category: DockerStorageCategory) {
  return `${formatInteger(locale, category.activeCount)}/${formatInteger(locale, category.totalCount)} active, ${formatFileSize(locale, category.sizeBytes)}`;
}

function formatImageReference(image: DockerImageInventoryItem) {
  return image.reference || `${image.repository}:${image.tag}`;
}

function formatStoragePath(item: RootStorageInventoryItem) {
  return item.path;
}

function formatContainerImage(container: ContainerHealthItem) {
  return container.image || "—";
}

function formatDateTime(locale: Locale, value: string | null) {
  if (!value) {
    return "—";
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatBoolean(ops: Awaited<ReturnType<typeof getTranslations>>, value: boolean) {
  return value ? ops("enabledValue") : ops("disabledValue");
}

function healthVariant(status: HealthState) {
  return status === "ok" ? "success" : status === "warning" ? "warning" : "neutral";
}

function smokeVariant(status: SmokeState) {
  return status === "passed" ? "success" : status === "failed" ? "danger" : "warning";
}

function restoreDrillVariant(status: RestoreDrillState) {
  return status === "passed" ? "success" : status === "failed" ? "danger" : "warning";
}

function healthLabel(ops: Awaited<ReturnType<typeof getTranslations>>, status: HealthState) {
  if (status === "ok") {
    return ops("statusOk");
  }

  if (status === "warning") {
    return ops("statusWarning");
  }

  return ops("statusUnknown");
}

function smokeLabel(ops: Awaited<ReturnType<typeof getTranslations>>, status: SmokeState) {
  if (status === "passed") {
    return ops("smokePassed");
  }

  if (status === "failed") {
    return ops("smokeFailed");
  }

  if (status === "missing") {
    return ops("smokeMissing");
  }

  return ops("statusUnknown");
}

function restoreDrillLabel(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  status: RestoreDrillState,
) {
  if (status === "passed") {
    return ops("restoreDrillPassed");
  }

  if (status === "failed") {
    return ops("restoreDrillFailed");
  }

  if (status === "missing") {
    return ops("restoreDrillMissing");
  }

  return ops("statusUnknown");
}

function backupEncryptionModeLabel(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  mode: BackupEncryptionMode,
) {
  if (mode === "enabled") {
    return ops("encryptionEnabled");
  }

  if (mode === "disabled") {
    return ops("encryptionDisabled");
  }

  return ops("statusUnknown");
}

function backupOffsiteModeLabel(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  mode: BackupOffsiteMode,
) {
  if (mode === "local") {
    return ops("offsiteLocal");
  }

  if (mode === "rclone") {
    return ops("offsiteRclone");
  }

  if (mode === "disabled") {
    return ops("offsiteDisabled");
  }

  return ops("statusUnknown");
}

function backupOffsiteFilesystemLabel(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  sameFilesystem: boolean | null,
  sameFilesystemAllowed: boolean,
) {
  if (sameFilesystem === true) {
    return sameFilesystemAllowed
      ? ops("offsiteSameFilesystemAllowed")
      : ops("offsiteSameFilesystemYes");
  }

  if (sameFilesystem === false) {
    return ops("offsiteSameFilesystemNo");
  }

  return ops("statusUnknown");
}

function passphraseFileLabel(
  ops: Awaited<ReturnType<typeof getTranslations>>,
  configured: boolean,
  exists: boolean | null,
) {
  if (!configured) {
    return ops("passphraseNotConfigured");
  }

  return exists === false ? ops("passphraseMissing") : ops("passphrasePresent");
}

function warningLabel(ops: Awaited<ReturnType<typeof getTranslations>>, warning: string) {
  const labels: Record<string, string> = {
    status_file_missing: ops("warningStatusFileMissing"),
    status_stale: ops("warningStatusStale"),
    disk_low: ops("warningDiskLow"),
    disk_high_usage: ops("warningDiskHighUsage"),
    disk_unknown: ops("warningDiskUnknown"),
    disk_trend_depleting: ops("warningDiskTrendDepleting"),
    root_storage_inventory_unknown: ops("warningRootStorageInventoryUnknown"),
    shared_app_storage_attention: ops("warningSharedAppStorageAttention"),
    shared_app_storage_stale: ops("warningSharedAppStorageStale"),
    docker_storage_unknown: ops("warningDockerStorageUnknown"),
    docker_image_inventory_unknown: ops("warningDockerImageInventoryUnknown"),
    container_health_unknown: ops("warningContainerHealthUnknown"),
    container_health_attention: ops("warningContainerHealthAttention"),
    docker_safe_reclaimable_high: ops("warningDockerSafeReclaimableHigh"),
    docker_reclaimable_high: ops("warningDockerReclaimableHigh"),
    ops_status_timer_attention: ops("warningOpsStatusTimer"),
    ops_status_service_attention: ops("warningOpsStatusService"),
    backup_timer_attention: ops("warningBackupTimer"),
    backup_service_attention: ops("warningBackupService"),
    smoke_timer_attention: ops("warningSmokeTimer"),
    smoke_service_attention: ops("warningSmokeService"),
    reminder_timer_attention: ops("warningReminderTimer"),
    reminder_service_attention: ops("warningReminderService"),
    housekeeping_timer_attention: ops("warningHousekeepingTimer"),
    housekeeping_service_attention: ops("warningHousekeepingService"),
    housekeeping_latest_failed: ops("warningHousekeepingLatestFailed"),
    housekeeping_latest_missing: ops("warningHousekeepingLatestMissing"),
    housekeeping_latest_unconfirmed: ops("warningHousekeepingLatestUnconfirmed"),
    housekeeping_latest_stale: ops("warningHousekeepingLatestStale"),
    backup_freshness_attention: ops("warningBackupFreshnessAttention"),
    backup_freshness_unknown: ops("warningBackupFreshnessUnknown"),
    backup_encryption_disabled: ops("warningBackupEncryptionDisabled"),
    backup_encryption_missing_artifacts: ops("warningBackupEncryptionMissingArtifacts"),
    backup_plaintext_artifacts: ops("warningBackupPlaintextArtifacts"),
    backup_encryption_sidecar_missing: ops("warningBackupEncryptionSidecarMissing"),
    backup_passphrase_missing: ops("warningBackupPassphraseMissing"),
    backup_encryption_unknown: ops("warningBackupEncryptionUnknown"),
    backup_passphrase_escrow_missing: ops("warningBackupPassphraseEscrowMissing"),
    backup_passphrase_escrow_attention: ops("warningBackupPassphraseEscrowAttention"),
    backup_offsite_disabled: ops("warningBackupOffsiteDisabled"),
    backup_offsite_attention: ops("warningBackupOffsiteAttention"),
    backup_offsite_same_filesystem: ops("warningBackupOffsiteSameFilesystem"),
    restore_drill_failed: ops("warningRestoreDrillFailed"),
    restore_drill_missing: ops("warningRestoreDrillMissing"),
    restore_drill_stale: ops("warningRestoreDrillStale"),
    smoke_failed: ops("warningSmokeFailed"),
    smoke_missing: ops("warningSmokeMissing"),
    smoke_stale: ops("warningSmokeStale"),
  };

  return labels[warning] ?? warning;
}

function MetricRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-3 text-sm"
      data-testid={testId}
    >
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function ForbiddenOpsState({
  backLabel,
  body,
  locale,
  title,
}: {
  backLabel: string;
  body: string;
  locale: Locale;
  title: string;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <AlertTriangle aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link href={`/${locale}/app`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
      </section>
    </main>
  );
}

export default async function OpsPage({ params }: PageProps) {
  const { locale } = await params;
  const nav = await getTranslations({ locale, namespace: "Nav" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const ops = await getTranslations({ locale, namespace: "Ops" });
  const model = await getDashboardModel();
  const activeHouseholdName = model.activeHousehold?.name ?? ops("title");
  let status: OpsStatusSnapshot;

  try {
    status = await readOpsStatusForUser(model.user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ForbiddenOpsState
          backLabel={ops("backToDashboard")}
          body={ops("forbiddenBody")}
          locale={locale}
          title={ops("forbiddenTitle")}
        />
      );
    }

    throw error;
  }

  const navItems = [
    { label: nav("dashboard"), icon: Home, href: `/${locale}/app` },
    { label: nav("expenses"), icon: ReceiptText, href: `/${locale}/app` },
    { label: nav("ledger"), icon: WalletCards, href: `/${locale}/app/ledger` },
    { label: nav("calendar"), icon: CalendarDays, href: `/${locale}/app/calendar` },
    { label: nav("tasks"), icon: ListChecks, href: `/${locale}/app/calendar` },
    { label: nav("stats"), icon: BarChart3, href: `/${locale}/app/stats` },
    { label: nav("audit"), icon: Activity, href: `/${locale}/app/audit` },
    { label: nav("ops"), icon: ServerCog, href: `/${locale}/app/ops`, active: true },
    { label: nav("settings"), icon: Settings, href: `/${locale}/app` },
  ];
  const warningLabels = status.summary.warnings.map((warning) => warningLabel(ops, warning));

  return (
    <main className="min-h-svh overflow-x-hidden bg-background text-foreground">
      <div className="grid min-h-svh lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-card lg:block">
          <div className="flex h-full flex-col px-4 py-5">
            <Link
              className="focus-ring mb-8 inline-flex items-center gap-2 rounded-md px-1 text-sm font-semibold"
              href={`/${locale}`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                R
              </span>
              {common("product")}
            </Link>
            <nav aria-label={ops("title")} className="grid gap-1">
              {navItems.map((item) => (
                <Link
                  className={cn(
                    "focus-ring inline-flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    item.active && "bg-muted text-foreground",
                  )}
                  href={item.href}
                  key={item.label}
                >
                  <item.icon aria-hidden="true" className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto">
              <LocaleSwitcher
                ariaLabel={common("language")}
                labels={{ "en-US": common("english"), "zh-CN": common("chinese") }}
                locale={locale}
              />
            </div>
          </div>
        </aside>

        <section className="w-full min-w-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/92 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {activeHouseholdName}
                </p>
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{ops("title")}</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {identity("signedInAs", { name: model.user.displayName })}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <Button asChild className="max-w-full px-3" variant="outline">
                  <Link href={`/${locale}/app`}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {ops("backToDashboard")}
                  </Link>
                </Button>
                <div className="sm:hidden">
                  <LocaleSwitcher
                    ariaLabel={common("language")}
                    labels={{ "en-US": common("english"), "zh-CN": common("chinese") }}
                    locale={locale}
                  />
                </div>
              </div>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {ops("hint")}
              </p>
              <Badge
                data-testid="ops-summary-status"
                variant={healthVariant(status.summary.status)}
              >
                {healthLabel(ops, status.summary.status)}
              </Badge>
            </div>

            <section
              className="rounded-lg border border-border bg-card p-5"
              data-testid="ops-summary"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {status.summary.status === "ok" ? (
                    <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                  ) : (
                    <AlertTriangle aria-hidden="true" className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{ops("summary")}</h2>
                    <Badge variant="neutral">
                      {status.source === "host_status_file"
                        ? ops("sourceHost")
                        : ops("sourceRuntime")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ops("generatedAt", { time: formatDateTime(locale, status.generatedAt) })}
                  </p>
                  {warningLabels.length > 0 ? (
                    <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      {warningLabels.map((warning) => (
                        <li className="flex gap-2" key={warning}>
                          <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 text-amber-700"
                          />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">{ops("noWarnings")}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-2 2xl:grid-cols-4">
              <div
                className="min-w-0 rounded-lg border border-border bg-card"
                data-testid="ops-disk-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h2 className="text-base font-semibold">{ops("disk")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ops("diskHint")}</p>
                  </div>
                  <HardDrive aria-hidden="true" className="h-5 w-5 text-sky-700" />
                </div>
                <div className="grid min-w-0 gap-3 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">{ops("available")}</p>
                      <p className="mt-1 text-2xl font-semibold" data-testid="ops-disk-available">
                        {formatBytes(locale, status.disk.availableBytes)}
                      </p>
                    </div>
                    <Badge variant={healthVariant(status.disk.status)}>
                      {healthLabel(ops, status.disk.status)}
                    </Badge>
                  </div>
                  <MetricRow
                    label={ops("used")}
                    value={formatBytes(locale, status.disk.usedBytes)}
                  />
                  <MetricRow
                    label={ops("usedPercent")}
                    testId="ops-disk-used-percent"
                    value={formatPercent(locale, status.disk.usedPercent)}
                  />
                  <MetricRow label={ops("path")} value={status.disk.path} />
                  <MetricRow
                    label={ops("checkedAt")}
                    value={formatDateTime(locale, status.disk.checkedAt)}
                  />
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <LineChart aria-hidden="true" className="h-4 w-4" />
                        {ops("capacityTrend")}
                      </span>
                      <Badge
                        data-testid="ops-disk-trend-status"
                        variant={healthVariant(status.diskTrend.status)}
                      >
                        {healthLabel(ops, status.diskTrend.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("trendSamples")}
                        testId="ops-disk-trend-samples"
                        value={formatInteger(locale, status.diskTrend.sampleCount)}
                      />
                      <MetricRow
                        label={ops("trendWindow")}
                        testId="ops-disk-trend-window"
                        value={formatHours(ops, locale, status.diskTrend.windowHours)}
                      />
                      <MetricRow
                        label={ops("availableChange")}
                        testId="ops-disk-trend-available-change"
                        value={formatSignedFileSize(locale, status.diskTrend.availableChangeBytes)}
                      />
                      <MetricRow
                        label={ops("usedPerDay")}
                        testId="ops-disk-trend-used-per-day"
                        value={formatPerDay(ops, locale, status.diskTrend.averageUsedBytesPerDay)}
                      />
                      <MetricRow
                        label={ops("estimatedFull")}
                        testId="ops-disk-trend-eta"
                        value={formatDaysUntilFull(
                          ops,
                          locale,
                          status.diskTrend.estimatedDaysUntilFull,
                        )}
                      />
                    </div>
                    {status.diskTrend.error ? (
                      <p className="mt-3 text-sm text-muted-foreground">{status.diskTrend.error}</p>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 min-w-0 border-t border-border pt-3"
                    data-testid="ops-root-storage-inventory"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <FolderTree aria-hidden="true" className="h-4 w-4" />
                        {ops("rootStorageInventory")}
                      </span>
                      <Badge
                        data-testid="ops-root-storage-status"
                        variant={healthVariant(status.rootStorageInventory.status)}
                      >
                        {healthLabel(ops, status.rootStorageInventory.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("rootStorageRecorded")}
                        testId="ops-root-storage-total"
                        value={formatFileSize(locale, status.rootStorageInventory.totalBytes)}
                      />
                      <MetricRow
                        label={ops("rootStoragePaths")}
                        testId="ops-root-storage-path-count"
                        value={formatInteger(locale, status.rootStorageInventory.paths.length)}
                      />
                      {status.rootStorageInventory.paths.length > 0 ? (
                        <div className="grid min-w-0 gap-2">
                          {status.rootStorageInventory.paths.map((item) => (
                            <div
                              className="min-w-0 rounded-md border border-border bg-background/60 px-3 py-2"
                              data-testid="ops-root-storage-row"
                              key={item.path}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <p
                                  className="min-w-0 truncate text-sm font-medium"
                                  title={formatStoragePath(item)}
                                >
                                  {formatStoragePath(item)}
                                </p>
                                <span className="shrink-0 text-sm font-semibold">
                                  {formatFileSize(locale, item.sizeBytes)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{ops("noRootStoragePaths")}</p>
                      )}
                    </div>
                    {status.rootStorageInventory.error ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {status.rootStorageInventory.error}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 min-w-0 border-t border-border pt-3"
                    data-testid="ops-shared-app-storage-inventory"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <FolderTree aria-hidden="true" className="h-4 w-4" />
                        {ops("sharedAppStorageInventory")}
                      </span>
                      <Badge
                        data-testid="ops-shared-app-storage-status"
                        variant={healthVariant(status.sharedAppStorageInventory.status)}
                      >
                        {healthLabel(ops, status.sharedAppStorageInventory.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("sharedAppStorageRecorded")}
                        testId="ops-shared-app-storage-total"
                        value={formatFileSize(locale, status.sharedAppStorageInventory.totalBytes)}
                      />
                      <MetricRow
                        label={ops("sharedAppStoragePaths")}
                        testId="ops-shared-app-storage-path-count"
                        value={formatInteger(locale, status.sharedAppStorageInventory.paths.length)}
                      />
                      <MetricRow
                        label={ops("sharedAppStorageTimedOut")}
                        testId="ops-shared-app-storage-timeouts"
                        value={formatInteger(
                          locale,
                          status.sharedAppStorageInventory.timedOutPaths.length,
                        )}
                      />
                      <MetricRow
                        label={ops("sharedAppStorageSkipped")}
                        testId="ops-shared-app-storage-skips"
                        value={formatInteger(
                          locale,
                          status.sharedAppStorageInventory.skippedPaths.length,
                        )}
                      />
                      {status.sharedAppStorageInventory.paths.length > 0 ? (
                        <div className="grid min-w-0 gap-2">
                          {status.sharedAppStorageInventory.paths.map((item) => (
                            <div
                              className="min-w-0 rounded-md border border-border bg-background/60 px-3 py-2"
                              data-testid="ops-shared-app-storage-row"
                              key={item.path}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <p
                                  className="min-w-0 truncate text-sm font-medium"
                                  title={formatStoragePath(item)}
                                >
                                  {formatStoragePath(item)}
                                </p>
                                <span className="shrink-0 text-sm font-semibold">
                                  {formatFileSize(locale, item.sizeBytes)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {ops("noSharedAppStoragePaths")}
                        </p>
                      )}
                      {status.sharedAppStorageInventory.skippedPaths.length > 0 ? (
                        <div className="grid min-w-0 gap-2">
                          {status.sharedAppStorageInventory.skippedPaths.map((itemPath) => (
                            <div
                              className="min-w-0 rounded-md border border-dashed border-border bg-background/40 px-3 py-2"
                              data-testid="ops-shared-app-storage-skipped-row"
                              key={itemPath}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <p
                                  className="min-w-0 truncate text-sm font-medium"
                                  title={itemPath}
                                >
                                  {itemPath}
                                </p>
                                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                                  {ops("sharedAppStorageSkipped")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {status.sharedAppStorageInventory.error ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {status.sharedAppStorageInventory.error}
                      </p>
                    ) : null}
                  </div>
                  {status.disk.error ? (
                    <p className="text-sm text-rose-700">{status.disk.error}</p>
                  ) : null}
                </div>
              </div>

              <div
                className="min-w-0 rounded-lg border border-border bg-card"
                data-testid="ops-docker-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h2 className="text-base font-semibold">{ops("dockerStorage")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ops("dockerStorageHint")}</p>
                  </div>
                  <Boxes aria-hidden="true" className="h-5 w-5 text-cyan-700" />
                </div>
                <div className="grid gap-3 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        {ops("safeReclaimable")}
                      </p>
                      <p
                        className="mt-1 text-2xl font-semibold"
                        data-testid="ops-docker-reclaimable"
                      >
                        {formatFileSize(locale, status.dockerStorage.safeReclaimableBytes)}
                      </p>
                    </div>
                    <Badge
                      data-testid="ops-docker-status"
                      variant={healthVariant(status.dockerStorage.status)}
                    >
                      {healthLabel(ops, status.dockerStorage.status)}
                    </Badge>
                  </div>
                  <MetricRow
                    label={ops("reclaimableThreshold")}
                    value={formatFileSize(locale, status.dockerStorage.reclaimableWarningBytes)}
                  />
                  <MetricRow
                    label={ops("dockerReportedReclaimable")}
                    testId="ops-docker-reported-reclaimable"
                    value={formatFileSize(locale, status.dockerStorage.totalReclaimableBytes)}
                  />
                  <MetricRow
                    label={ops("images")}
                    testId="ops-docker-images"
                    value={formatDockerCategory(locale, status.dockerStorage.images)}
                  />
                  <MetricRow
                    label={ops("imagesReclaimable")}
                    testId="ops-docker-images-reclaimable"
                    value={formatReclaimable(locale, status.dockerStorage.images)}
                  />
                  <MetricRow
                    label={ops("localVolumes")}
                    value={formatDockerCategory(locale, status.dockerStorage.localVolumes)}
                  />
                  <MetricRow
                    label={ops("localVolumesReclaimable")}
                    value={formatReclaimable(locale, status.dockerStorage.localVolumes)}
                  />
                  <MetricRow
                    label={ops("buildCache")}
                    value={formatDockerCategory(locale, status.dockerStorage.buildCache)}
                  />
                  <MetricRow
                    label={ops("buildCacheReclaimable")}
                    value={formatReclaimable(locale, status.dockerStorage.buildCache)}
                  />
                  <div
                    className="mt-2 min-w-0 border-t border-border pt-3"
                    data-testid="ops-docker-image-inventory"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("largestImages")}</span>
                      <Badge
                        data-testid="ops-docker-image-inventory-status"
                        variant={healthVariant(status.dockerImageInventory.status)}
                      >
                        {healthLabel(ops, status.dockerImageInventory.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid min-w-0 gap-3">
                      <MetricRow
                        label={ops("imageTotalSize")}
                        testId="ops-docker-image-total-size"
                        value={formatFileSize(locale, status.dockerImageInventory.totalImageBytes)}
                      />
                      <MetricRow
                        label={ops("imageActiveSize")}
                        testId="ops-docker-image-active-size"
                        value={formatFileSize(locale, status.dockerImageInventory.activeImageBytes)}
                      />
                      <MetricRow
                        label={ops("imageInactiveSize")}
                        testId="ops-docker-image-inactive-size"
                        value={formatFileSize(
                          locale,
                          status.dockerImageInventory.inactiveImageBytes,
                        )}
                      />
                      <MetricRow
                        label={ops("imageSafeCandidates")}
                        testId="ops-docker-image-safe-candidates"
                        value={formatFileSize(
                          locale,
                          status.dockerImageInventory.safeReclaimableImageBytes,
                        )}
                      />
                      {status.dockerImageInventory.images.length > 0 ? (
                        <div className="grid min-w-0 gap-2">
                          {status.dockerImageInventory.images.map((image) => (
                            <div
                              className="min-w-0 rounded-md border border-border bg-background/60 px-3 py-2"
                              data-testid="ops-docker-image-row"
                              key={`${image.imageId}-${formatImageReference(image)}`}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p
                                    className="truncate text-sm font-medium"
                                    title={formatImageReference(image)}
                                  >
                                    {formatImageReference(image)}
                                  </p>
                                  <p className="mt-1 truncate text-xs text-muted-foreground">
                                    {image.imageId}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold">
                                  {formatFileSize(locale, image.sizeBytes)}
                                </span>
                              </div>
                              <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  {ops("imageContainers", {
                                    count: formatInteger(locale, image.containers),
                                  })}
                                </span>
                                <span>
                                  {ops("imageCreated", {
                                    time: formatDateTime(locale, image.createdAt),
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{ops("noImages")}</p>
                      )}
                    </div>
                    {status.dockerImageInventory.error ? (
                      <p className="mt-3 text-sm text-rose-700">
                        {status.dockerImageInventory.error}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 min-w-0 border-t border-border pt-3"
                    data-testid="ops-container-health"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        {ops("containerHealth")}
                      </span>
                      <Badge
                        data-testid="ops-container-health-status"
                        variant={healthVariant(status.containerHealth.status)}
                      >
                        {healthLabel(ops, status.containerHealth.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid min-w-0 gap-3">
                      <MetricRow
                        label={ops("containerCount")}
                        testId="ops-container-health-count"
                        value={formatInteger(locale, status.containerHealth.containers.length)}
                      />
                      {status.containerHealth.containers.length > 0 ? (
                        <div className="grid min-w-0 gap-2">
                          {status.containerHealth.containers.map((container) => (
                            <div
                              className="min-w-0 rounded-md border border-border bg-background/60 px-3 py-2"
                              data-testid="ops-container-health-row"
                              key={container.name}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p
                                    className="truncate text-sm font-medium"
                                    title={container.name}
                                  >
                                    {container.name}
                                  </p>
                                  <p
                                    className="mt-1 truncate text-xs text-muted-foreground"
                                    title={formatContainerImage(container)}
                                  >
                                    {formatContainerImage(container)}
                                  </p>
                                </div>
                                <Badge
                                  className="shrink-0"
                                  variant={healthVariant(container.status)}
                                >
                                  {healthLabel(ops, container.status)}
                                </Badge>
                              </div>
                              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                <span className="truncate" title={container.state}>
                                  {ops("containerState")}: {container.state}
                                </span>
                                <span className="truncate" title={container.health}>
                                  {ops("containerHealthCheck")}: {container.health}
                                </span>
                                <span>
                                  {ops("containerRestarts")}:{" "}
                                  {formatInteger(locale, container.restartCount)}
                                </span>
                                <span className="truncate">
                                  {ops("containerStarted")}:{" "}
                                  {formatDateTime(locale, container.startedAt)}
                                </span>
                              </div>
                              {container.error ? (
                                <p className="mt-2 text-xs text-rose-700">{container.error}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{ops("noContainers")}</p>
                      )}
                    </div>
                    {status.containerHealth.error ? (
                      <p className="mt-3 text-sm text-rose-700">{status.containerHealth.error}</p>
                    ) : null}
                  </div>
                  <MetricRow
                    label={ops("checkedAt")}
                    value={formatDateTime(locale, status.dockerStorage.checkedAt)}
                  />
                  {status.dockerStorage.error ? (
                    <p className="text-sm text-rose-700">{status.dockerStorage.error}</p>
                  ) : null}
                </div>
              </div>

              <div
                className="min-w-0 rounded-lg border border-border bg-card"
                data-testid="ops-backup-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h2 className="text-base font-semibold">{ops("backup")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ops("backupHint")}</p>
                  </div>
                  <TimerReset aria-hidden="true" className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="grid gap-3 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{ops("timer")}</span>
                    <Badge
                      data-testid="ops-backup-timer-status"
                      variant={healthVariant(status.backupTimer.status)}
                    >
                      {healthLabel(ops, status.backupTimer.status)}
                    </Badge>
                  </div>
                  <MetricRow label={ops("timerName")} value={status.backupTimer.name} />
                  <MetricRow label={ops("activeState")} value={status.backupTimer.activeState} />
                  <MetricRow label={ops("enabledState")} value={status.backupTimer.enabledState} />
                  <MetricRow
                    label={ops("nextRun")}
                    testId="ops-backup-next-run"
                    value={formatDateTime(locale, status.backupTimer.nextElapse)}
                  />
                  <MetricRow
                    label={ops("lastRun")}
                    value={formatDateTime(locale, status.backupTimer.lastTrigger)}
                  />
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("service")}</span>
                      <Badge variant={healthVariant(status.backupService.status)}>
                        {healthLabel(ops, status.backupService.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow label={ops("serviceResult")} value={status.backupService.result} />
                      <MetricRow
                        label={ops("serviceExitCode")}
                        value={status.backupService.execMainStatus}
                      />
                      <MetricRow
                        label={ops("serviceFinishedAt")}
                        value={formatDateTime(locale, status.backupService.finishedAt)}
                      />
                    </div>
                  </div>
                  {status.backupTimer.error || status.backupService.error ? (
                    <p className="text-sm text-rose-700">
                      {status.backupTimer.error ?? status.backupService.error}
                    </p>
                  ) : null}
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        {ops("backupFreshness")}
                      </span>
                      <Badge
                        data-testid="ops-backup-freshness-status"
                        variant={healthVariant(status.backupFreshness.status)}
                      >
                        {healthLabel(ops, status.backupFreshness.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("latestCompleteBackup")}
                        testId="ops-backup-freshness-complete"
                        value={formatDateTime(
                          locale,
                          status.backupFreshness.latestCompleteBackupAt,
                        )}
                      />
                      <MetricRow
                        label={ops("latestPostgresBackup")}
                        testId="ops-backup-freshness-postgres"
                        value={formatDateTime(locale, status.backupFreshness.latestPostgresAt)}
                      />
                      <MetricRow
                        label={ops("latestUploadsBackup")}
                        value={formatDateTime(locale, status.backupFreshness.latestUploadsAt)}
                      />
                      <MetricRow
                        label={ops("latestFileManifestBackup")}
                        value={formatDateTime(locale, status.backupFreshness.latestFileManifestAt)}
                      />
                    </div>
                    {status.backupFreshness.error ? (
                      <p className="mt-3 text-sm text-rose-700">{status.backupFreshness.error}</p>
                    ) : null}
                  </div>
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("restoreDrill")}</span>
                      <Badge
                        data-testid="ops-restore-drill-status"
                        variant={restoreDrillVariant(status.latestRestoreDrill.status)}
                      >
                        {restoreDrillLabel(ops, status.latestRestoreDrill.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("restoreDrillCheckedAt")}
                        value={formatDateTime(locale, status.latestRestoreDrill.generatedAt)}
                      />
                      <MetricRow
                        label={ops("restoreDrillBackup")}
                        testId="ops-restore-drill-backup-file"
                        value={status.latestRestoreDrill.backupFile ?? "—"}
                      />
                      <MetricRow
                        label={ops("restoreDrillAuditTotal")}
                        value={formatNullableInteger(locale, status.latestRestoreDrill.auditTotal)}
                      />
                      <MetricRow
                        label={ops("restoreDrillAuditHashed")}
                        value={formatNullableInteger(locale, status.latestRestoreDrill.auditHashed)}
                      />
                      <MetricRow
                        label={ops("restoreDrillAuditBroken")}
                        testId="ops-restore-drill-audit-broken"
                        value={formatNullableInteger(locale, status.latestRestoreDrill.auditBroken)}
                      />
                    </div>
                    {status.latestRestoreDrill.message ? (
                      <p
                        className={cn(
                          "mt-3 text-sm",
                          status.latestRestoreDrill.status === "failed"
                            ? "text-rose-700"
                            : "text-muted-foreground",
                        )}
                      >
                        {status.latestRestoreDrill.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("encryption")}</span>
                      <Badge
                        data-testid="ops-backup-encryption-status"
                        variant={healthVariant(status.backupEncryption.status)}
                      >
                        {healthLabel(ops, status.backupEncryption.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("encryptionMode")}
                        testId="ops-backup-encryption-mode"
                        value={backupEncryptionModeLabel(ops, status.backupEncryption.configured)}
                      />
                      <MetricRow
                        label={ops("encryptedArtifacts")}
                        value={status.backupEncryption.encryptedArtifacts.toString()}
                      />
                      <MetricRow
                        label={ops("plaintextArtifacts")}
                        testId="ops-backup-plaintext-artifacts"
                        value={status.backupEncryption.plaintextArtifacts.toString()}
                      />
                      <MetricRow
                        label={ops("missingChecksums")}
                        value={status.backupEncryption.missingSha256Sidecars.toString()}
                      />
                      <MetricRow
                        label={ops("passphraseFile")}
                        value={passphraseFileLabel(
                          ops,
                          status.backupEncryption.passphraseFileConfigured,
                          status.backupEncryption.passphraseFileExists,
                        )}
                      />
                      <MetricRow
                        label={ops("backupRoot")}
                        value={status.backupEncryption.backupRoot}
                      />
                    </div>
                    {status.backupEncryption.error ? (
                      <p className="mt-3 text-sm text-rose-700">{status.backupEncryption.error}</p>
                    ) : null}
                  </div>
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        {ops("passphraseEscrow")}
                      </span>
                      <Badge
                        data-testid="ops-backup-passphrase-escrow-status"
                        variant={healthVariant(status.backupPassphraseEscrow.status)}
                      >
                        {healthLabel(ops, status.backupPassphraseEscrow.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("escrowMethod")}
                        testId="ops-backup-passphrase-escrow-method"
                        value={status.backupPassphraseEscrow.method ?? "—"}
                      />
                      <MetricRow
                        label={ops("escrowCustodian")}
                        value={status.backupPassphraseEscrow.custodian ?? "—"}
                      />
                      <MetricRow
                        label={ops("escrowLastVerified")}
                        testId="ops-backup-passphrase-escrow-verified"
                        value={formatDateTime(locale, status.backupPassphraseEscrow.lastVerifiedAt)}
                      />
                      <MetricRow
                        label={ops("escrowStatusFile")}
                        value={status.backupPassphraseEscrow.statusFile}
                      />
                    </div>
                    {status.backupPassphraseEscrow.error ? (
                      <p className="mt-3 text-sm text-rose-700">
                        {status.backupPassphraseEscrow.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("offsiteCopy")}</span>
                      <Badge
                        data-testid="ops-backup-offsite-status"
                        variant={healthVariant(status.backupOffsite.status)}
                      >
                        {healthLabel(ops, status.backupOffsite.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("offsiteMode")}
                        testId="ops-backup-offsite-mode"
                        value={backupOffsiteModeLabel(ops, status.backupOffsite.mode)}
                      />
                      <MetricRow
                        label={ops("offsiteArtifacts")}
                        testId="ops-backup-offsite-artifacts"
                        value={formatInteger(locale, status.backupOffsite.artifactCount)}
                      />
                      <MetricRow
                        label={ops("offsiteBytes")}
                        value={formatFileSize(locale, status.backupOffsite.totalBytes)}
                      />
                      <MetricRow
                        label={ops("offsiteLastSync")}
                        value={formatDateTime(locale, status.backupOffsite.lastSyncAt)}
                      />
                      <MetricRow
                        label={ops("offsiteTarget")}
                        value={status.backupOffsite.target ?? "—"}
                      />
                      <MetricRow
                        label={ops("offsiteFilesystem")}
                        testId="ops-backup-offsite-filesystem"
                        value={backupOffsiteFilesystemLabel(
                          ops,
                          status.backupOffsite.sameFilesystem,
                          status.backupOffsite.sameFilesystemAllowed,
                        )}
                      />
                      <MetricRow
                        label={ops("offsiteSourceDevice")}
                        value={status.backupOffsite.sourceDeviceId ?? "—"}
                      />
                      <MetricRow
                        label={ops("offsiteTargetDevice")}
                        value={status.backupOffsite.targetDeviceId ?? "—"}
                      />
                    </div>
                    {status.backupOffsite.error ? (
                      <p className="mt-3 text-sm text-rose-700">{status.backupOffsite.error}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div
                className="min-w-0 rounded-lg border border-border bg-card"
                data-testid="ops-housekeeping-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h2 className="text-base font-semibold">{ops("housekeeping")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ops("housekeepingHint")}</p>
                  </div>
                  <Wrench aria-hidden="true" className="h-5 w-5 text-violet-700" />
                </div>
                <div className="grid gap-3 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{ops("timer")}</span>
                    <Badge
                      data-testid="ops-housekeeping-timer-status"
                      variant={healthVariant(status.housekeepingTimer.status)}
                    >
                      {healthLabel(ops, status.housekeepingTimer.status)}
                    </Badge>
                  </div>
                  <MetricRow label={ops("timerName")} value={status.housekeepingTimer.name} />
                  <MetricRow
                    label={ops("activeState")}
                    value={status.housekeepingTimer.activeState}
                  />
                  <MetricRow
                    label={ops("enabledState")}
                    value={status.housekeepingTimer.enabledState}
                  />
                  <MetricRow
                    label={ops("nextRun")}
                    testId="ops-housekeeping-next-run"
                    value={formatDateTime(locale, status.housekeepingTimer.nextElapse)}
                  />
                  <MetricRow
                    label={ops("lastRun")}
                    value={formatDateTime(locale, status.housekeepingTimer.lastTrigger)}
                  />
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("service")}</span>
                      <Badge variant={healthVariant(status.housekeepingService.status)}>
                        {healthLabel(ops, status.housekeepingService.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("serviceResult")}
                        value={status.housekeepingService.result}
                      />
                      <MetricRow
                        label={ops("serviceExitCode")}
                        value={status.housekeepingService.execMainStatus}
                      />
                      <MetricRow
                        label={ops("serviceFinishedAt")}
                        value={formatDateTime(locale, status.housekeepingService.finishedAt)}
                      />
                    </div>
                  </div>
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        {ops("latestHousekeeping")}
                      </span>
                      <Badge
                        data-testid="ops-housekeeping-latest-status"
                        variant={healthVariant(status.latestHousekeeping.status)}
                      >
                        {healthLabel(ops, status.latestHousekeeping.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("cleanupConfirmed")}
                        testId="ops-housekeeping-confirmed"
                        value={formatBoolean(ops, status.latestHousekeeping.cleanupConfirmed)}
                      />
                      <MetricRow
                        label={ops("cleanupFinishedAt")}
                        testId="ops-housekeeping-finished"
                        value={formatDateTime(locale, status.latestHousekeeping.finishedAt)}
                      />
                      <MetricRow
                        label={ops("cleanupExitCode")}
                        value={formatNullableInteger(locale, status.latestHousekeeping.exitCode)}
                      />
                      <MetricRow
                        label={ops("cleanupReclaimed")}
                        testId="ops-housekeeping-reclaimed"
                        value={formatSignedFileSize(
                          locale,
                          status.latestHousekeeping.reclaimedBytes,
                        )}
                      />
                      <MetricRow
                        label={ops("cleanupAvailableBefore")}
                        value={formatBytes(locale, status.latestHousekeeping.availableBytesBefore)}
                      />
                      <MetricRow
                        label={ops("cleanupAvailableAfter")}
                        value={formatBytes(locale, status.latestHousekeeping.availableBytesAfter)}
                      />
                      <MetricRow
                        label={ops("cleanupRepoArtifacts")}
                        value={status.latestHousekeeping.repoArtifactsMode}
                      />
                      <MetricRow
                        label={ops("cleanupBrowserWorkspaces")}
                        value={status.latestHousekeeping.browserWorkspacesMode}
                      />
                      <MetricRow
                        label={ops("cleanupDockerPrune")}
                        value={formatBoolean(ops, status.latestHousekeeping.dockerPruneEnabled)}
                      />
                      <MetricRow
                        label={ops("cleanupEphemeralImages")}
                        value={
                          status.latestHousekeeping.roompireEphemeralImagesEnabled &&
                          status.latestHousekeeping.roompireEphemeralImageRepositories.length > 0
                            ? status.latestHousekeeping.roompireEphemeralImageRepositories.join(
                                ", ",
                              )
                            : formatBoolean(
                                ops,
                                status.latestHousekeeping.roompireEphemeralImagesEnabled,
                              )
                        }
                      />
                      <MetricRow
                        label={ops("cleanupStatusFile")}
                        value={status.latestHousekeeping.statusFile}
                      />
                    </div>
                    {status.latestHousekeeping.message ? (
                      <p
                        className={cn(
                          "mt-3 text-sm",
                          status.latestHousekeeping.status === "warning"
                            ? "text-rose-700"
                            : "text-muted-foreground",
                        )}
                      >
                        {status.latestHousekeeping.message}
                      </p>
                    ) : null}
                    {status.latestHousekeeping.error ? (
                      <p className="mt-2 text-sm text-rose-700">
                        {status.latestHousekeeping.error}
                      </p>
                    ) : null}
                  </div>
                  {status.housekeepingTimer.error || status.housekeepingService.error ? (
                    <p className="text-sm text-rose-700">
                      {status.housekeepingTimer.error ?? status.housekeepingService.error}
                    </p>
                  ) : null}
                </div>
              </div>

              <div
                className="min-w-0 rounded-lg border border-border bg-card"
                data-testid="ops-reminders-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h2 className="text-base font-semibold">{ops("reminders")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ops("remindersHint")}</p>
                  </div>
                  <BellRing aria-hidden="true" className="h-5 w-5 text-amber-700" />
                </div>
                <div className="grid gap-3 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{ops("timer")}</span>
                    <Badge
                      data-testid="ops-reminders-timer-status"
                      variant={healthVariant(status.reminderTimer.status)}
                    >
                      {healthLabel(ops, status.reminderTimer.status)}
                    </Badge>
                  </div>
                  <MetricRow label={ops("timerName")} value={status.reminderTimer.name} />
                  <MetricRow label={ops("activeState")} value={status.reminderTimer.activeState} />
                  <MetricRow
                    label={ops("enabledState")}
                    value={status.reminderTimer.enabledState}
                  />
                  <MetricRow
                    label={ops("nextRun")}
                    testId="ops-reminders-next-run"
                    value={formatDateTime(locale, status.reminderTimer.nextElapse)}
                  />
                  <MetricRow
                    label={ops("lastRun")}
                    value={formatDateTime(locale, status.reminderTimer.lastTrigger)}
                  />
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("service")}</span>
                      <Badge variant={healthVariant(status.reminderService.status)}>
                        {healthLabel(ops, status.reminderService.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow
                        label={ops("serviceResult")}
                        value={status.reminderService.result}
                      />
                      <MetricRow
                        label={ops("serviceExitCode")}
                        value={status.reminderService.execMainStatus}
                      />
                      <MetricRow
                        label={ops("serviceFinishedAt")}
                        value={formatDateTime(locale, status.reminderService.finishedAt)}
                      />
                    </div>
                  </div>
                  {status.reminderTimer.error || status.reminderService.error ? (
                    <p className="text-sm text-rose-700">
                      {status.reminderTimer.error ?? status.reminderService.error}
                    </p>
                  ) : null}
                </div>
              </div>

              <div
                className="min-w-0 rounded-lg border border-border bg-card"
                data-testid="ops-smoke-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h2 className="text-base font-semibold">{ops("smoke")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ops("smokeHint")}</p>
                  </div>
                  <Activity aria-hidden="true" className="h-5 w-5 text-rose-700" />
                </div>
                <div className="grid gap-3 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{ops("latestResult")}</span>
                    <Badge
                      data-testid="ops-smoke-status"
                      variant={smokeVariant(status.latestSmoke.status)}
                    >
                      {smokeLabel(ops, status.latestSmoke.status)}
                    </Badge>
                  </div>
                  <MetricRow label={ops("baseUrl")} value={status.latestSmoke.baseUrl ?? "—"} />
                  <MetricRow
                    label={ops("checkedAt")}
                    value={formatDateTime(locale, status.latestSmoke.generatedAt)}
                  />
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("timer")}</span>
                      <Badge
                        data-testid="ops-smoke-timer-status"
                        variant={healthVariant(status.smokeTimer.status)}
                      >
                        {healthLabel(ops, status.smokeTimer.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow label={ops("timerName")} value={status.smokeTimer.name} />
                      <MetricRow label={ops("activeState")} value={status.smokeTimer.activeState} />
                      <MetricRow
                        label={ops("enabledState")}
                        value={status.smokeTimer.enabledState}
                      />
                      <MetricRow
                        label={ops("nextRun")}
                        value={formatDateTime(locale, status.smokeTimer.nextElapse)}
                      />
                      <MetricRow
                        label={ops("lastRun")}
                        value={formatDateTime(locale, status.smokeTimer.lastTrigger)}
                      />
                    </div>
                  </div>
                  <div className="mt-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">{ops("service")}</span>
                      <Badge variant={healthVariant(status.smokeService.status)}>
                        {healthLabel(ops, status.smokeService.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <MetricRow label={ops("serviceResult")} value={status.smokeService.result} />
                      <MetricRow
                        label={ops("serviceExitCode")}
                        value={status.smokeService.execMainStatus}
                      />
                      <MetricRow
                        label={ops("serviceFinishedAt")}
                        value={formatDateTime(locale, status.smokeService.finishedAt)}
                      />
                    </div>
                  </div>
                  {status.latestSmoke.checks.length > 0 ? (
                    <div className="mt-2 grid gap-2">
                      {status.latestSmoke.checks.map((check) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                          data-testid={`ops-smoke-check-${check.path.replaceAll("/", "-")}`}
                          key={check.path}
                        >
                          <span className="truncate font-medium">{check.path}</span>
                          <Badge variant={check.status === "passed" ? "success" : "danger"}>
                            {check.httpStatus ?? "—"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{ops("noSmokeChecks")}</p>
                  )}
                  {status.latestSmoke.message ? (
                    <p className="text-sm text-rose-700">{status.latestSmoke.message}</p>
                  ) : null}
                  {status.smokeTimer.error || status.smokeService.error ? (
                    <p className="text-sm text-rose-700">
                      {status.smokeTimer.error ?? status.smokeService.error}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section
              className="mt-6 rounded-lg border border-border bg-card p-5"
              data-testid="ops-status-file-card"
            >
              <div className="flex items-start gap-3">
                <FileJson aria-hidden="true" className="mt-1 h-5 w-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{ops("statusFile")}</h2>
                    <Badge variant={status.statusFile.loaded ? "success" : "warning"}>
                      {status.statusFile.loaded ? ops("loaded") : ops("missing")}
                    </Badge>
                  </div>
                  <p className="mt-2 truncate text-sm text-muted-foreground">
                    {status.statusFile.path ?? "—"}
                  </p>
                  {status.statusFile.error ? (
                    <p className="mt-2 text-sm text-rose-700">{status.statusFile.error}</p>
                  ) : null}
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        {ops("snapshotRefresh")}
                      </span>
                      <Badge
                        data-testid="ops-status-timer-status"
                        variant={healthVariant(status.opsStatusTimer.status)}
                      >
                        {healthLabel(ops, status.opsStatusTimer.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <MetricRow label={ops("timerName")} value={status.opsStatusTimer.name} />
                      <MetricRow
                        label={ops("nextRun")}
                        value={formatDateTime(locale, status.opsStatusTimer.nextElapse)}
                      />
                      <MetricRow
                        label={ops("lastRun")}
                        value={formatDateTime(locale, status.opsStatusTimer.lastTrigger)}
                      />
                      <MetricRow
                        label={ops("serviceResult")}
                        value={status.opsStatusService.result}
                      />
                      <MetricRow
                        label={ops("serviceExitCode")}
                        value={status.opsStatusService.execMainStatus}
                      />
                      <MetricRow
                        label={ops("serviceFinishedAt")}
                        value={formatDateTime(locale, status.opsStatusService.finishedAt)}
                      />
                    </div>
                    {status.opsStatusTimer.error || status.opsStatusService.error ? (
                      <p className="mt-3 text-sm text-rose-700">
                        {status.opsStatusTimer.error ?? status.opsStatusService.error}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
