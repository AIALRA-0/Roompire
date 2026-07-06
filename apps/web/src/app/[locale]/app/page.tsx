import Link from "next/link";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FileClock,
  Home,
  ListChecks,
  Plus,
  ReceiptText,
  ServerCog,
  Settings,
  ShieldCheck,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExpenseWorkspace } from "@/components/expense-workspace";
import { IdentityWorkspace } from "@/components/identity-workspace";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NotificationCenter } from "@/components/notification-center";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { getDashboardModel } from "@/server/dashboard/model";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const proposalStatusFilterValues = [
  "DRAFT",
  "SUBMITTED",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "PARTIALLY_MATURED",
  "MATURED_TO_LEDGER",
  "REJECTED",
  "DISPUTED",
  "CANCELLED",
] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const amountPattern = /^\d+(\.\d{1,6})?$/;

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function allowedSearchValue<const T extends readonly string[]>(
  value: string | string[] | undefined,
  allowed: T,
): T[number] | undefined {
  const firstValue = firstSearchValue(value);

  return firstValue && allowed.includes(firstValue) ? firstValue : undefined;
}

function trimmedSearchValue(value: string | string[] | undefined, maxLength: number) {
  const firstValue = firstSearchValue(value)?.trim();

  return firstValue && firstValue.length <= maxLength ? firstValue : undefined;
}

function uuidSearchValue(value: string | string[] | undefined) {
  const firstValue = firstSearchValue(value);

  return firstValue && uuidPattern.test(firstValue) ? firstValue : undefined;
}

function dateSearchValue(value: string | string[] | undefined) {
  const firstValue = firstSearchValue(value);

  return firstValue && dateOnlyPattern.test(firstValue) ? firstValue : undefined;
}

function amountSearchValue(value: string | string[] | undefined) {
  const firstValue = firstSearchValue(value);

  return firstValue && amountPattern.test(firstValue) ? firstValue : undefined;
}

export default async function AppPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const rawSearchParams = (await searchParams) ?? {};
  const nav = await getTranslations({ locale, namespace: "Nav" });
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const expense = await getTranslations({ locale, namespace: "Expense" });
  const notifications = await getTranslations({ locale, namespace: "Notifications" });
  const proposalLimitOptions = ["1", "5", "10", "20"];
  const proposalLimit = firstSearchValue(rawSearchParams.proposalLimit) ?? "5";
  const selectedProposalLimit = proposalLimitOptions.includes(proposalLimit)
    ? Number(proposalLimit)
    : 5;
  const proposalFilters = {
    q: trimmedSearchValue(rawSearchParams.proposalQ, 120),
    status: allowedSearchValue(rawSearchParams.proposalStatus, proposalStatusFilterValues),
    categoryId: uuidSearchValue(rawSearchParams.proposalCategoryId),
    tagId: uuidSearchValue(rawSearchParams.proposalTagId),
    memberUserId: uuidSearchValue(rawSearchParams.proposalMemberUserId),
    from: dateSearchValue(rawSearchParams.proposalFrom),
    to: dateSearchValue(rawSearchParams.proposalTo),
    minAmount: amountSearchValue(rawSearchParams.proposalMinAmount),
    maxAmount: amountSearchValue(rawSearchParams.proposalMaxAmount),
    limit: selectedProposalLimit,
  };
  const model = await getDashboardModel({
    expenseProposalQuery: proposalFilters,
  });
  const activeHouseholdName = model.activeHousehold?.name ?? t("title");
  const pwaInstallLabels = {
    install: t("installApp"),
    installed: t("appInstalled"),
    installing: common("working"),
  };

  const navItems = [
    { label: nav("dashboard"), icon: Home, href: `/${locale}/app`, active: true },
    { label: nav("expenses"), icon: ReceiptText, href: `/${locale}/app` },
    { label: nav("ledger"), icon: WalletCards, href: `/${locale}/app/ledger` },
    { label: nav("calendar"), icon: CalendarDays, href: `/${locale}/app/calendar` },
    { label: nav("tasks"), icon: ListChecks, href: `/${locale}/app/calendar` },
    { label: nav("stats"), icon: BarChart3, href: `/${locale}/app/stats` },
    { label: nav("audit"), icon: Activity, href: `/${locale}/app/audit` },
    { label: nav("ops"), icon: ServerCog, href: `/${locale}/app/ops` },
    { label: nav("settings"), icon: Settings, href: `/${locale}/app` },
  ];

  const stats = [
    {
      label: t("statPending"),
      value: String(model.pendingProposalCount),
      icon: FileClock,
      tone: "text-amber-700",
      testId: "dashboard-stat-pending-proposals",
    },
    {
      label: t("statMatured"),
      value: String(model.maturedObligationCount),
      icon: CircleDollarSign,
      tone: "text-emerald-700",
      testId: "dashboard-stat-matured-obligations",
    },
    {
      label: t("statFx"),
      value: model.activeHousehold?.settlementCurrency ?? "—",
      icon: ShieldCheck,
      tone: "text-sky-700",
      testId: "dashboard-stat-settlement-currency",
    },
    {
      label: t("statTasks"),
      value: String(model.upcomingTaskCount),
      icon: Clock3,
      tone: "text-rose-700",
      testId: "dashboard-stat-upcoming-tasks",
    },
  ];

  const calendarItems = [
    { title: t("rentEvent"), meta: "Jul 5", status: common("pending") },
    { title: t("choreEvent"), meta: "Jul 6", status: common("approved") },
    { title: t("groceryEvent"), meta: "Jul 7", status: common("submitted") },
  ];

  const auditItems =
    model.auditItems.length > 0
      ? model.auditItems.map((item) => item.action)
      : [t("auditCreated"), t("auditFx"), t("auditGuard")];

  const identityLabels = {
    profileSettings: identity("profileSettings"),
    profileSettingsHint: identity("profileSettingsHint"),
    displayName: identity("displayName"),
    preferredLocale: identity("preferredLocale"),
    notificationPreferences: identity("notificationPreferences"),
    notificationPreferencesHint: identity("notificationPreferencesHint"),
    inAppNotifications: identity("inAppNotifications"),
    emailNotifications: identity("emailNotifications"),
    proposalUpdates: identity("proposalUpdates"),
    settlementUpdates: identity("settlementUpdates"),
    taskReminders: identity("taskReminders"),
    saveProfile: identity("saveProfile"),
    profileSaved: identity("profileSaved"),
    devSession: identity("devSession"),
    devSessionHint: identity("devSessionHint"),
    devUser: identity("devUser"),
    useDevUser: identity("useDevUser"),
    householdAccess: identity("householdAccess"),
    householdAccessHint: identity("householdAccessHint"),
    createHousehold: identity("createHousehold"),
    createHouseholdHint: identity("createHouseholdHint"),
    householdName: identity("householdName"),
    timezone: identity("timezone"),
    settlementCurrency: identity("settlementCurrency"),
    defaultLocale: identity("defaultLocale"),
    fxPolicy: identity("fxPolicy"),
    approvalPolicy: identity("approvalPolicy"),
    clearingPolicy: identity("clearingPolicy"),
    dataRetention: identity("dataRetention"),
    operationalRetentionDays: identity("operationalRetentionDays"),
    attachmentRetentionDays: identity("attachmentRetentionDays"),
    retentionIndefinite: identity("retentionIndefinite"),
    retentionReview: identity("retentionReview"),
    retentionReviewHint: identity("retentionReviewHint"),
    retentionReviewOnly: identity("retentionReviewOnly"),
    retentionGeneratedAt: identity("retentionGeneratedAt"),
    retentionOperationalCutoff: identity("retentionOperationalCutoff"),
    retentionAttachmentCutoff: identity("retentionAttachmentCutoff"),
    retentionDueRecords: identity("retentionDueRecords"),
    retentionDueFiles: identity("retentionDueFiles"),
    retentionDueBytes: identity("retentionDueBytes"),
    retentionCompletedFiles: identity("retentionCompletedFiles"),
    retentionPendingUploads: identity("retentionPendingUploads"),
    retentionPolicyDays: identity("retentionPolicyDays"),
    retentionNoCutoff: identity("retentionNoCutoff"),
    approvalEachDebtor: identity("approvalEachDebtor"),
    approvalAllParticipants: identity("approvalAllParticipants"),
    approvalPayerOnly: identity("approvalPayerOnly"),
    clearingDirectOnly: identity("clearingDirectOnly"),
    clearingHouseholdNetting: identity("clearingHouseholdNetting"),
    fxLockExpenseDate: identity("fxLockExpenseDate"),
    fxOriginalCurrencyDebt: identity("fxOriginalCurrencyDebt"),
    fxManualApproval: identity("fxManualApproval"),
    fxDifferenceAdjustment: identity("fxDifferenceAdjustment"),
    householdSettings: identity("householdSettings"),
    householdSettingsHint: identity("householdSettingsHint"),
    saveSettings: identity("saveSettings"),
    settingsSaved: identity("settingsSaved"),
    categoryManagement: identity("categoryManagement"),
    categoryManagementHint: identity("categoryManagementHint"),
    createCategory: identity("createCategory"),
    categoryCreated: identity("categoryCreated"),
    categoryUpdated: identity("categoryUpdated"),
    categoryArchived: identity("categoryArchived"),
    categoryNameEn: identity("categoryNameEn"),
    categoryNameZhCn: identity("categoryNameZhCn"),
    categoryIcon: identity("categoryIcon"),
    categoryColorToken: identity("categoryColorToken"),
    categorySortOrder: identity("categorySortOrder"),
    saveCategory: identity("saveCategory"),
    archiveCategory: identity("archiveCategory"),
    noCategories: identity("noCategories"),
    cannotManageCategories: identity("cannotManageCategories"),
    tagManagement: identity("tagManagement"),
    tagManagementHint: identity("tagManagementHint"),
    createTag: identity("createTag"),
    tagCreated: identity("tagCreated"),
    tagUpdated: identity("tagUpdated"),
    tagArchived: identity("tagArchived"),
    tagName: identity("tagName"),
    tagColorToken: identity("tagColorToken"),
    tagSortOrder: identity("tagSortOrder"),
    saveTag: identity("saveTag"),
    archiveTag: identity("archiveTag"),
    noTags: identity("noTags"),
    cannotManageTags: identity("cannotManageTags"),
    createHouseholdButton: identity("createHouseholdButton"),
    householdCreated: identity("householdCreated"),
    householdList: identity("householdList"),
    activeHousehold: identity("activeHousehold"),
    activeHouseholdHint: identity("activeHouseholdHint"),
    useHousehold: identity("useHousehold"),
    householdSwitched: identity("householdSwitched"),
    memberDirectory: identity("memberDirectory"),
    memberDirectoryHint: identity("memberDirectoryHint"),
    inviteMember: identity("inviteMember"),
    inviteMemberHint: identity("inviteMemberHint"),
    inviteEmail: identity("inviteEmail"),
    inviteRole: identity("inviteRole"),
    createInvite: identity("createInvite"),
    inviteCreated: identity("inviteCreated"),
    inviteCode: identity("inviteCode"),
    inviteLink: identity("inviteLink"),
    acceptInvite: identity("acceptInvite"),
    acceptInviteHint: identity("acceptInviteHint"),
    inviteToken: identity("inviteToken"),
    acceptInviteButton: identity("acceptInviteButton"),
    inviteAccepted: identity("inviteAccepted"),
    noHousehold: identity("noHousehold"),
    openMembers: identity("openMembers"),
    updateRole: identity("updateRole"),
    roleUpdated: identity("roleUpdated"),
    removeMember: identity("removeMember"),
    memberRemoved: identity("memberRemoved"),
    transferOwnership: identity("transferOwnership"),
    ownershipTransferred: identity("ownershipTransferred"),
    ownershipTransferHint: identity("ownershipTransferHint"),
    memberManagement: identity("memberManagement"),
    memberManagementHint: identity("memberManagementHint"),
    cannotInvite: identity("cannotInvite"),
    cannotManageMembers: identity("cannotManageMembers"),
    apiBoundary: identity("apiBoundary"),
    apiBoundaryHint: identity("apiBoundaryHint"),
    errorFallback: identity("errorFallback"),
    working: common("working"),
    locales: {
      "en-US": common("english"),
      "zh-CN": common("chinese"),
    },
    roles: {
      OWNER: common("owner"),
      ADMIN: common("admin"),
      MEMBER: common("roleMember"),
      VIEWER: common("viewer"),
    },
  };

  const expenseLabels = {
    title: expense("title"),
    hint: expense("hint"),
    formTitle: expense("formTitle"),
    formHint: expense("formHint"),
    proposalTitle: expense("proposalTitle"),
    merchant: expense("merchant"),
    category: expense("category"),
    tags: expense("tags"),
    uncategorized: expense("uncategorized"),
    expenseDate: expense("expenseDate"),
    dueDate: expense("dueDate"),
    originalAmount: expense("originalAmount"),
    originalCurrency: expense("originalCurrency"),
    settlementCurrency: expense("settlementCurrency"),
    fxRate: expense("fxRate"),
    fxRateHintAutomatic: expense("fxRateHintAutomatic"),
    fxRateHintOriginalCurrency: expense("fxRateHintOriginalCurrency"),
    fxRateHintManual: expense("fxRateHintManual"),
    fxRateHintDifferenceAdjustment: expense("fxRateHintDifferenceAdjustment"),
    debtors: expense("debtors"),
    payerShareIncluded: expense("payerShareIncluded"),
    splitMethod: expense("splitMethod"),
    splitMethodEqual: expense("splitMethodEqual"),
    splitMethodExact: expense("splitMethodExact"),
    splitMethodPercentage: expense("splitMethodPercentage"),
    splitMethodShares: expense("splitMethodShares"),
    splitValueExact: expense("splitValueExact"),
    splitValuePercentage: expense("splitValuePercentage"),
    splitValueShares: expense("splitValueShares"),
    splitPreview: expense("splitPreview"),
    splitPreviewEmpty: expense("splitPreviewEmpty"),
    splitPreviewInvalid: expense("splitPreviewInvalid"),
    receipt: expense("receipt"),
    receiptHint: expense("receiptHint"),
    selectedReceipt: expense("selectedReceipt"),
    submitProposal: expense("submitProposal"),
    proposalSubmitted: expense("proposalSubmitted"),
    noProposals: expense("noProposals"),
    queueTitle: expense("queueTitle"),
    queueHint: expense("queueHint"),
    filters: expense("filters"),
    filtersHint: expense("filtersHint"),
    search: expense("search"),
    status: common("status"),
    member: expense("member"),
    anyStatus: expense("anyStatus"),
    anyCategory: expense("anyCategory"),
    anyTag: expense("anyTag"),
    anyMember: expense("anyMember"),
    fromDate: expense("fromDate"),
    toDate: expense("toDate"),
    minAmount: expense("minAmount"),
    maxAmount: expense("maxAmount"),
    applyFilters: expense("applyFilters"),
    clearFilters: expense("clearFilters"),
    loadMore: expense("loadMore"),
    openDetail: expense("openDetail"),
    cannotCreate: expense("cannotCreate"),
    noHousehold: identity("noHousehold"),
    errorFallback: identity("errorFallback"),
    working: common("working"),
    statuses: {
      DRAFT: expense("statusDraft"),
      SUBMITTED: common("submitted"),
      PARTIALLY_APPROVED: expense("statusPartiallyApproved"),
      APPROVED: common("approved"),
      PARTIALLY_MATURED: expense("statusPartiallyMatured"),
      MATURED_TO_LEDGER: expense("statusMatured"),
      REJECTED: common("rejected"),
      DISPUTED: expense("statusDisputed"),
      CANCELLED: expense("statusCancelled"),
    },
  };
  const notificationLabels = {
    title: notifications("title"),
    hint: notifications("hint"),
    unread: notifications("unread", { count: "{count}" }),
    noNotifications: notifications("noNotifications"),
    loadMore: notifications("loadMore"),
    markRead: notifications("markRead"),
    read: notifications("read"),
    working: common("working"),
    pushEnabled: notifications("pushEnabled"),
    pushDisabled: notifications("pushDisabled"),
    pushEnable: notifications("pushEnable"),
    pushDisable: notifications("pushDisable"),
    pushUnsupported: notifications("pushUnsupported"),
    pushNotConfigured: notifications("pushNotConfigured"),
    pushPermissionDenied: notifications("pushPermissionDenied"),
    pushError: notifications("pushError"),
    openProposal: notifications("openProposal"),
    openCalendar: notifications("openCalendar"),
    openLedger: notifications("openLedger"),
    expenseProposalAssignedTitle: notifications("expenseProposalAssignedTitle"),
    expenseProposalAssignedBody: notifications("expenseProposalAssignedBody", {
      amount: "{amount}",
      currency: "{currency}",
      title: "{title}",
    }),
    taskDueSoonTitle: notifications("taskDueSoonTitle"),
    taskDueSoonBody: notifications("taskDueSoonBody", {
      due: "{due}",
      title: "{title}",
    }),
    taskOverdueTitle: notifications("taskOverdueTitle"),
    taskOverdueBody: notifications("taskOverdueBody", {
      due: "{due}",
      title: "{title}",
    }),
    debtDueSoonTitle: notifications("debtDueSoonTitle"),
    debtDueSoonBody: notifications("debtDueSoonBody", {
      amount: "{amount}",
      currency: "{currency}",
      due: "{due}",
    }),
    debtOverdueTitle: notifications("debtOverdueTitle"),
    debtOverdueBody: notifications("debtOverdueBody", {
      amount: "{amount}",
      currency: "{currency}",
      due: "{due}",
    }),
    settlementConfirmationReminderTitle: notifications("settlementConfirmationReminderTitle"),
    settlementConfirmationReminderBody: notifications("settlementConfirmationReminderBody", {
      amount: "{amount}",
      currency: "{currency}",
    }),
    unknownTitle: notifications("unknownTitle"),
    unknownBody: notifications("unknownBody"),
  };
  const memberNamesByUserId = new Map(
    model.members.map((member) => [
      member.userId,
      member.displayNameOverride ?? member.user.displayName,
    ]),
  );

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
            <nav aria-label={t("mobileNav")} className="grid gap-1">
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
                  {common("product")}
                </p>
                <h1 className="truncate text-xl font-semibold sm:text-2xl">
                  {activeHouseholdName}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {identity("signedInAs", { name: model.user.displayName })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PwaInstallPrompt labels={pwaInstallLabels} />
                <div className="hidden items-center gap-2 sm:flex">
                  <Button variant="outline">
                    <UserPlus aria-hidden="true" className="h-4 w-4" />
                    {t("inviteMember")}
                  </Button>
                  <Button>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {t("newExpense")}
                  </Button>
                </div>
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
                {t("subtitle")}
              </p>
              <div className="flex gap-2 sm:hidden">
                <Button className="flex-1" variant="outline">
                  <UserPlus aria-hidden="true" className="h-4 w-4" />
                  {t("inviteMember")}
                </Button>
                <Button className="flex-1">
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  {t("newExpense")}
                </Button>
              </div>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  className="rounded-lg border border-border bg-card p-4"
                  data-testid={stat.testId}
                  key={stat.label}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <stat.icon aria-hidden="true" className={cn("h-4 w-4", stat.tone)} />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </section>

            <div className="mt-3 flex justify-end gap-2">
              <Button asChild size="sm" variant="outline">
                <Link data-testid="dashboard-stats-link" href={`/${locale}/app/stats`}>
                  <BarChart3 aria-hidden="true" className="h-4 w-4" />
                  {nav("stats")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link data-testid="dashboard-ops-link" href={`/${locale}/app/ops`}>
                  <ServerCog aria-hidden="true" className="h-4 w-4" />
                  {nav("ops")}
                </Link>
              </Button>
            </div>

            <div className="mt-6">
              <NotificationCenter
                key={`${model.user.id}:${model.notificationPage.nextCursor ?? "end"}:${model.notifications
                  .map((notification) => notification.id)
                  .join(":")}`}
                labels={notificationLabels}
                locale={locale}
                notifications={model.notifications}
                page={model.notificationPage}
                unreadCount={model.unreadNotificationCount}
              />
            </div>

            <div className="mt-6">
              <ExpenseWorkspace
                key={`${model.activeHousehold?.id ?? "none"}:${
                  model.expenseProposalPage.nextCursor ?? "end"
                }:${[
                  proposalFilters.q,
                  proposalFilters.status,
                  proposalFilters.categoryId,
                  proposalFilters.tagId,
                  proposalFilters.memberUserId,
                  proposalFilters.from,
                  proposalFilters.to,
                  proposalFilters.minAmount,
                  proposalFilters.maxAmount,
                  selectedProposalLimit,
                ].join(":")}:${model.expenseProposals.map((proposal) => proposal.id).join(":")}`}
                activeHouseholdId={model.activeHousehold?.id ?? null}
                canCreateExpenseProposals={model.canCreateExpenseProposals}
                categories={model.categories.map((category) => ({
                  id: category.id,
                  name: locale === "zh-CN" ? category.nameZhCn : category.nameEn,
                }))}
                tags={model.tags.map((tag) => ({
                  id: tag.id,
                  name: tag.name,
                  colorToken: tag.colorToken,
                }))}
                currentUserEmail={model.user.email}
                labels={expenseLabels}
                locale={locale}
                filterValues={{
                  q: proposalFilters.q ?? "",
                  status: proposalFilters.status ?? "",
                  categoryId: proposalFilters.categoryId ?? "",
                  tagId: proposalFilters.tagId ?? "",
                  memberUserId: proposalFilters.memberUserId ?? "",
                  from: proposalFilters.from ?? "",
                  to: proposalFilters.to ?? "",
                  minAmount: proposalFilters.minAmount ?? "",
                  maxAmount: proposalFilters.maxAmount ?? "",
                  limit: selectedProposalLimit,
                }}
                members={model.members.map((member) => ({
                  userId: member.userId,
                  displayName: member.displayNameOverride ?? member.user.displayName,
                  email: member.user.email,
                  role: member.role,
                }))}
                proposals={model.expenseProposals.map((proposal) => ({
                  id: proposal.id,
                  title: proposal.title,
                  merchant: proposal.merchant,
                  categoryName: proposal.category
                    ? locale === "zh-CN"
                      ? proposal.category.nameZhCn
                      : proposal.category.nameEn
                    : null,
                  tags: proposal.tagLinks.map((link) => ({
                    id: link.tag.id,
                    name: link.tag.name,
                    colorToken: link.tag.colorToken,
                  })),
                  expenseDate: proposal.expenseDate.toISOString().slice(0, 10),
                  originalAmount: proposal.originalAmount.toString(),
                  originalCurrency: proposal.originalCurrency,
                  settlementAmount: proposal.settlementAmount.toString(),
                  settlementCurrency: proposal.settlementCurrency,
                  fxRate: proposal.fxRate?.toString() ?? null,
                  status: proposal.status,
                  debtorCount: proposal.shares.length,
                }))}
                proposalPage={model.expenseProposalPage}
                settlementCurrency={model.activeHousehold?.settlementCurrency ?? null}
                activeHouseholdFxPolicy={
                  model.activeHousehold?.fxPolicy === "ORIGINAL_CURRENCY_DEBT" ||
                  model.activeHousehold?.fxPolicy === "MANUAL_RATE_WITH_APPROVAL" ||
                  model.activeHousehold?.fxPolicy === "FX_DIFFERENCE_ADJUSTMENT"
                    ? model.activeHousehold.fxPolicy
                    : "LOCK_AT_EXPENSE_DATE"
                }
              />
            </div>

            <div className="mt-6">
              <IdentityWorkspace
                activeHouseholdId={model.activeHousehold?.id ?? null}
                canInviteMembers={model.canInviteMembers}
                canManageMembers={model.canManageMembers}
                categories={model.categories.map((category) => ({
                  id: category.id,
                  key: category.key,
                  nameEn: category.nameEn,
                  nameZhCn: category.nameZhCn,
                  icon: category.icon,
                  colorToken: category.colorToken,
                  sortOrder: category.sortOrder,
                }))}
                tags={model.tags.map((tag) => ({
                  id: tag.id,
                  name: tag.name,
                  colorToken: tag.colorToken,
                  sortOrder: tag.sortOrder,
                }))}
                currentUserDisplayName={model.userSettings.displayName}
                currentUserEmail={model.user.email}
                currentUserPreferredLocale={model.userSettings.preferredLocale}
                devUsers={[
                  { displayName: "Alice", email: "alice@example.test" },
                  { displayName: "Bob", email: "bob@example.test" },
                  { displayName: "Chen", email: "chen@example.test" },
                  { displayName: "Dana", email: "dana@example.test" },
                  { displayName: "Mia", email: "mia@example.test" },
                ]}
                households={model.householdMemberships.map((membership) => ({
                  id: membership.household.id,
                  name: membership.household.name,
                  role: membership.role,
                  timezone: membership.household.timezone,
                  settlementCurrency: membership.household.settlementCurrency,
                  defaultLocale: membership.household.defaultLocale as "en-US" | "zh-CN",
                  fxPolicy: membership.household.fxPolicy,
                  approvalPolicy: membership.household.approvalPolicy as
                    "PAYER_AND_EACH_DEBTOR" | "ALL_PARTICIPANTS" | "PAYER_ONLY",
                  clearingPolicy: membership.household.clearingPolicy as
                    "DIRECT_ONLY" | "HOUSEHOLD_NETTING",
                  operationalRetentionDays: membership.household.operationalRetentionDays,
                  attachmentRetentionDays: membership.household.attachmentRetentionDays,
                }))}
                labels={identityLabels}
                locale={locale}
                members={model.members.map((member) => ({
                  id: member.id,
                  userId: member.userId,
                  displayName: member.displayNameOverride ?? member.user.displayName,
                  email: member.user.email,
                  role: member.role,
                }))}
                notificationPreferences={model.userSettings.notificationPreferences}
                retentionReview={model.retentionReview}
              />
            </div>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
              <div className="grid gap-6">
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-5">
                    <h2 className="text-lg font-semibold">{t("formalBalances")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("formalBalancesHint")}</p>
                  </div>
                  {model.debtObligations.length > 0 ? (
                    <div className="divide-y divide-border">
                      {model.debtObligations.map((obligation) => (
                        <div
                          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          data-testid={`formal-obligation-${obligation.id}`}
                          key={obligation.id}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {memberNamesByUserId.get(obligation.debtorUserId) ??
                                obligation.debtorUserId}{" "}
                              {t("owes")}{" "}
                              {memberNamesByUserId.get(obligation.creditorUserId) ??
                                obligation.creditorUserId}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("openObligation")} · {obligation.originalCurrency}{" "}
                              {obligation.originalAmount.toString()}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">
                            {obligation.settlementCurrency} {obligation.remainingAmount.toString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
                      <WalletCards aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                      <p className="mt-3 font-medium">{t("emptyBalance")}</p>
                      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                        {t("emptyBalanceHint")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-6">
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-5">
                    <h2 className="text-lg font-semibold">{t("calendar")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("calendarHint")}</p>
                  </div>
                  <div className="divide-y divide-border">
                    {calendarItems.map((item) => (
                      <div className="flex items-center justify-between gap-3 p-4" key={item.title}>
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
                        </div>
                        <Badge variant="neutral">{item.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-5">
                    <h2 className="text-lg font-semibold">{t("audit")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("auditHint")}</p>
                  </div>
                  <ol className="grid gap-3 p-5">
                    {auditItems.map((item, index) => (
                      <li className="flex gap-3 text-sm" key={`${item}-${index}`}>
                        <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="border-t border-border p-5">
                    <Button asChild size="sm" variant="outline">
                      <Link data-testid="dashboard-audit-link" href={`/${locale}/app/audit`}>
                        {nav("audit")}
                      </Link>
                    </Button>
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
