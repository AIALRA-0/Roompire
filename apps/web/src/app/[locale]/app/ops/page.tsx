import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FileJson,
  HardDrive,
  Home,
  ListChecks,
  ReceiptText,
  ServerCog,
  Settings,
  TimerReset,
  WalletCards,
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

function formatPercent(locale: Locale, value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
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

function healthVariant(status: HealthState) {
  return status === "ok" ? "success" : status === "warning" ? "warning" : "neutral";
}

function smokeVariant(status: SmokeState) {
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

function warningLabel(ops: Awaited<ReturnType<typeof getTranslations>>, warning: string) {
  const labels: Record<string, string> = {
    status_file_missing: ops("warningStatusFileMissing"),
    status_stale: ops("warningStatusStale"),
    disk_low: ops("warningDiskLow"),
    disk_high_usage: ops("warningDiskHighUsage"),
    disk_unknown: ops("warningDiskUnknown"),
    backup_timer_attention: ops("warningBackupTimer"),
    backup_service_attention: ops("warningBackupService"),
    smoke_failed: ops("warningSmokeFailed"),
    smoke_missing: ops("warningSmokeMissing"),
  };

  return labels[warning] ?? warning;
}

function MetricRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm" data-testid={testId}>
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
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
    <main className="min-h-svh bg-background text-foreground">
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

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/92 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {activeHouseholdName}
                </p>
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{ops("title")}</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {identity("signedInAs", { name: model.user.displayName })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
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

            <section className="mt-6 grid gap-6 xl:grid-cols-3">
              <div className="rounded-lg border border-border bg-card" data-testid="ops-disk-card">
                <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h2 className="text-base font-semibold">{ops("disk")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ops("diskHint")}</p>
                  </div>
                  <HardDrive aria-hidden="true" className="h-5 w-5 text-sky-700" />
                </div>
                <div className="grid gap-3 p-5">
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
                  {status.disk.error ? (
                    <p className="text-sm text-rose-700">{status.disk.error}</p>
                  ) : null}
                </div>
              </div>

              <div
                className="rounded-lg border border-border bg-card"
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
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card" data-testid="ops-smoke-card">
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
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
