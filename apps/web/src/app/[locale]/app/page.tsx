import Link from "next/link";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileClock,
  Home,
  ListChecks,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { IdentityWorkspace } from "@/components/identity-workspace";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { getDashboardModel } from "@/server/dashboard/model";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function AppPage({ params }: PageProps) {
  const { locale } = await params;
  const nav = await getTranslations({ locale, namespace: "Nav" });
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const model = await getDashboardModel();
  const activeHouseholdName = model.activeHousehold?.name ?? t("title");

  const navItems = [
    { label: nav("dashboard"), icon: Home, active: true },
    { label: nav("expenses"), icon: ReceiptText },
    { label: nav("ledger"), icon: WalletCards },
    { label: nav("calendar"), icon: CalendarDays },
    { label: nav("tasks"), icon: ListChecks },
    { label: nav("audit"), icon: Activity },
    { label: nav("settings"), icon: Settings },
  ];

  const stats = [
    {
      label: t("statPending"),
      value: String(model.pendingProposalCount),
      icon: FileClock,
      tone: "text-amber-700",
    },
    {
      label: t("statMatured"),
      value: String(model.maturedObligationCount),
      icon: CircleDollarSign,
      tone: "text-emerald-700",
    },
    {
      label: t("statFx"),
      value: model.activeHousehold?.settlementCurrency ?? "—",
      icon: ShieldCheck,
      tone: "text-sky-700",
    },
    {
      label: t("statTasks"),
      value: String(model.upcomingTaskCount),
      icon: Clock3,
      tone: "text-rose-700",
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
    approvalEachDebtor: identity("approvalEachDebtor"),
    approvalAllParticipants: identity("approvalAllParticipants"),
    approvalPayerOnly: identity("approvalPayerOnly"),
    fxLockExpenseDate: identity("fxLockExpenseDate"),
    fxOriginalCurrency: identity("fxOriginalCurrency"),
    fxManualApproval: identity("fxManualApproval"),
    fxDifferenceAdjustment: identity("fxDifferenceAdjustment"),
    householdSettings: identity("householdSettings"),
    householdSettingsHint: identity("householdSettingsHint"),
    saveSettings: identity("saveSettings"),
    settingsSaved: identity("settingsSaved"),
    createHouseholdButton: identity("createHouseholdButton"),
    householdCreated: identity("householdCreated"),
    householdList: identity("householdList"),
    activeHousehold: identity("activeHousehold"),
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
                  href={`/${locale}/app`}
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
                <div className="rounded-lg border border-border bg-card p-4" key={stat.label}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <stat.icon aria-hidden="true" className={cn("h-4 w-4", stat.tone)} />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </section>

            <div className="mt-6">
              <IdentityWorkspace
                activeHouseholdId={model.activeHousehold?.id ?? null}
                canInviteMembers={model.canInviteMembers}
                canManageMembers={model.canManageMembers}
                currentUserEmail={model.user.email}
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
              />
            </div>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
              <div className="grid gap-6">
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">{t("proposalQueue")}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("proposalQueueHint")}
                        </p>
                      </div>
                      <Badge variant="warning">{common("submitted")}</Badge>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
                      <div>
                        <p className="font-medium">{t("pendingProposal")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("pendingProposalMeta")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral">{t("approvalNeeded")}</Badge>
                        <Button size="sm" variant="outline">
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                          {common("approved")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-5">
                    <h2 className="text-lg font-semibold">{t("formalBalances")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("formalBalancesHint")}</p>
                  </div>
                  <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
                    <WalletCards aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 font-medium">{t("emptyBalance")}</p>
                    <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                      {t("emptyBalanceHint")}
                    </p>
                  </div>
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
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
