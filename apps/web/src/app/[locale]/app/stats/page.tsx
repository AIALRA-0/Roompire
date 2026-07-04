import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  FileText,
  Home,
  ListChecks,
  PieChart,
  ReceiptText,
  Settings,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HouseholdExportActions } from "@/components/household-export-actions";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { getDashboardModel } from "@/server/dashboard/model";
import {
  getStatsSummaryForHousehold,
  listCategoryStatsForHousehold,
  listMemberStatsForHousehold,
  type AmountTotal,
} from "@/server/stats/service";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

function formatAmount(locale: Locale, total: AmountTotal) {
  const amount = Number(total.amount);

  if (!Number.isFinite(amount)) {
    return `${total.currency} ${total.amount}`;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: total.currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTotals(locale: Locale, totals: AmountTotal[]) {
  return totals.length > 0 ? totals.map((total) => formatAmount(locale, total)).join(" · ") : "—";
}

export default async function StatsPage({ params }: PageProps) {
  const { locale } = await params;
  const nav = await getTranslations({ locale, namespace: "Nav" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const stats = await getTranslations({ locale, namespace: "Stats" });
  const model = await getDashboardModel();
  const activeHouseholdName = model.activeHousehold?.name ?? stats("title");
  const activeHouseholdId = model.activeHousehold?.id ?? null;
  const [summary, categories, members] = activeHouseholdId
    ? await Promise.all([
        getStatsSummaryForHousehold(model.user.id, activeHouseholdId),
        listCategoryStatsForHousehold(model.user.id, activeHouseholdId),
        listMemberStatsForHousehold(model.user.id, activeHouseholdId),
      ])
    : [null, [], []];
  const roleLabels = {
    OWNER: common("owner"),
    ADMIN: common("admin"),
    MEMBER: common("roleMember"),
    VIEWER: common("viewer"),
  };
  const navItems = [
    { label: nav("dashboard"), icon: Home, href: `/${locale}/app` },
    { label: nav("expenses"), icon: ReceiptText, href: `/${locale}/app` },
    { label: nav("ledger"), icon: WalletCards, href: `/${locale}/app/ledger` },
    { label: nav("calendar"), icon: CalendarDays, href: `/${locale}/app/calendar` },
    { label: nav("tasks"), icon: ListChecks, href: `/${locale}/app/calendar` },
    { label: nav("stats"), icon: BarChart3, href: `/${locale}/app/stats`, active: true },
    { label: nav("audit"), icon: Activity, href: `/${locale}/app/audit` },
    { label: nav("settings"), icon: Settings, href: `/${locale}/app` },
  ];
  const totalProposalCount = summary
    ? Object.values(summary.proposalCounts).reduce((total, count) => total + count, 0)
    : 0;
  const summaryCards = [
    {
      label: stats("settlementCurrency"),
      value: summary?.settlementCurrency ?? "—",
      detail: stats("settlementCurrencyHint"),
      icon: WalletCards,
      testId: "stats-summary-currency",
    },
    {
      label: stats("proposalVolume"),
      value: String(totalProposalCount),
      detail: summary
        ? stats("proposalVolumeHint", {
            submitted: summary.proposalCounts.SUBMITTED,
            approved: summary.proposalCounts.APPROVED,
            matured: summary.proposalCounts.MATURED_TO_LEDGER,
          })
        : "—",
      icon: FileText,
      testId: "stats-summary-proposals",
    },
    {
      label: stats("proposalTotals"),
      value: summary ? formatTotals(locale, summary.proposalSettlementTotals) : "—",
      detail: stats("proposalTotalsHint"),
      icon: PieChart,
      testId: "stats-summary-proposal-totals",
    },
    {
      label: stats("openBalances"),
      value: summary ? formatTotals(locale, summary.openObligationTotals) : "—",
      detail: stats("openBalancesHint"),
      icon: WalletCards,
      testId: "stats-summary-open-obligations",
    },
    {
      label: stats("tasks"),
      value: summary ? String(summary.taskCounts.open) : "0",
      detail: summary
        ? stats("tasksHint", { completed: summary.taskCounts.completed })
        : stats("tasksHint", { completed: 0 }),
      icon: ListChecks,
      testId: "stats-summary-tasks",
    },
    {
      label: stats("evidence"),
      value: summary ? String(summary.auditEventCount) : "0",
      detail: summary
        ? stats("evidenceHint", { receipts: summary.receiptFileCount })
        : stats("evidenceHint", { receipts: 0 }),
      icon: Activity,
      testId: "stats-summary-audit",
    },
  ];
  const exportLabels = {
    title: stats("exportTitle"),
    hint: stats("exportHint"),
    dataset: stats("exportDataset"),
    format: stats("exportFormat"),
    download: stats("exportDownload"),
    ready: stats("exportReady"),
    unavailable: stats("exportUnavailable"),
    errorFallback: stats("exportErrorFallback"),
    datasets: {
      expense_proposals: stats("exportDatasetExpenseProposals"),
      ledger_obligations: stats("exportDatasetLedgerObligations"),
      settlements: stats("exportDatasetSettlements"),
      audit_events: stats("exportDatasetAuditEvents"),
      members: stats("exportDatasetMembers"),
    },
    formats: {
      json: stats("exportFormatJson"),
      csv: stats("exportFormatCsv"),
    },
  };

  return (
    <main className="min-h-svh bg-background text-foreground" data-testid="stats-page">
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
            <nav aria-label={stats("title")} className="grid gap-1">
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
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{stats("title")}</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {identity("signedInAs", { name: model.user.displayName })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link href={`/${locale}/app`}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {stats("backToDashboard")}
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
                {stats("hint")}
              </p>
              <Badge variant="neutral">{stats("readOnly")}</Badge>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {summaryCards.map((card) => (
                <div
                  className="rounded-lg border border-border bg-card p-4"
                  data-testid={card.testId}
                  key={card.label}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <card.icon aria-hidden="true" className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-3 break-words text-2xl font-semibold">{card.value}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{card.detail}</p>
                </div>
              ))}
            </section>

            <div className="mt-6">
              <HouseholdExportActions activeHouseholdId={activeHouseholdId} labels={exportLabels} />
            </div>

            <section className="mt-6 rounded-lg border border-border bg-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-semibold">{stats("categoryBreakdown")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stats("categoryBreakdownHint")}
                </p>
              </div>
              {categories.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[720px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">{stats("category")}</th>
                        <th className="px-5 py-3 font-medium">{stats("proposals")}</th>
                        <th className="px-5 py-3 font-medium">{stats("proposalTotals")}</th>
                        <th className="px-5 py-3 font-medium">{stats("maturedShares")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {categories.map((category) => (
                        <tr
                          data-testid={`stats-category-row-${category.categoryKey}`}
                          key={category.categoryId ?? category.categoryKey}
                        >
                          <td className="px-5 py-4 font-medium">
                            {locale === "zh-CN" ? category.nameZhCn : category.nameEn}
                          </td>
                          <td className="px-5 py-4">{category.proposalCount}</td>
                          <td className="px-5 py-4">
                            {formatTotals(locale, category.proposalTotals)}
                          </td>
                          <td className="px-5 py-4">
                            {formatTotals(locale, category.maturedShareTotals)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                  <PieChart aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">{stats("noCategories")}</p>
                </div>
              )}
            </section>

            <section className="mt-6 rounded-lg border border-border bg-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-semibold">{stats("memberBreakdown")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{stats("memberBreakdownHint")}</p>
              </div>
              {members.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[1040px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">{common("member")}</th>
                        <th className="px-5 py-3 font-medium">{stats("created")}</th>
                        <th className="px-5 py-3 font-medium">{stats("paid")}</th>
                        <th className="px-5 py-3 font-medium">{stats("remainingOwed")}</th>
                        <th className="px-5 py-3 font-medium">{stats("remainingReceivable")}</th>
                        <th className="px-5 py-3 font-medium">{stats("settlementsPaid")}</th>
                        <th className="px-5 py-3 font-medium">{stats("settlementsReceived")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {members.map((member) => (
                        <tr data-testid={`stats-member-row-${member.userId}`} key={member.userId}>
                          <td className="px-5 py-4">
                            <div className="min-w-56">
                              <p className="font-medium">{member.displayName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{member.email}</p>
                              <Badge className="mt-2" variant="neutral">
                                {roleLabels[member.role as keyof typeof roleLabels] ?? member.role}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p>{member.createdProposalCount}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatTotals(locale, member.createdProposalTotals)}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            {formatTotals(locale, member.paidProposalTotals)}
                          </td>
                          <td className="px-5 py-4">
                            {formatTotals(locale, member.remainingOwedTotals)}
                          </td>
                          <td className="px-5 py-4">
                            {formatTotals(locale, member.remainingReceivableTotals)}
                          </td>
                          <td className="px-5 py-4">
                            {formatTotals(locale, member.confirmedSettlementPaidTotals)}
                          </td>
                          <td className="px-5 py-4">
                            {formatTotals(locale, member.confirmedSettlementReceivedTotals)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                  <UsersRound aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">{stats("noMembers")}</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
