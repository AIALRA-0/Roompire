import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Home,
  ListChecks,
  ReceiptText,
  Settings,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CalendarWorkspace } from "@/components/calendar-workspace";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { serializeCalendarEvent, serializeTask } from "@/server/calendar/serializers";
import { listCalendarEventsForHousehold, listTasksForHousehold } from "@/server/calendar/service";
import { getDashboardModel } from "@/server/dashboard/model";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function CalendarPage({ params }: PageProps) {
  const { locale } = await params;
  const nav = await getTranslations({ locale, namespace: "Nav" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const calendar = await getTranslations({ locale, namespace: "Calendar" });
  const expense = await getTranslations({ locale, namespace: "Expense" });
  const model = await getDashboardModel();
  const activeHouseholdName = model.activeHousehold?.name ?? calendar("title");
  const activeHouseholdId = model.activeHousehold?.id ?? null;
  const navItems = [
    { label: nav("dashboard"), icon: Home, href: `/${locale}/app` },
    { label: nav("expenses"), icon: ReceiptText, href: `/${locale}/app` },
    { label: nav("ledger"), icon: WalletCards, href: `/${locale}/app/ledger` },
    { label: nav("calendar"), icon: CalendarDays, href: `/${locale}/app/calendar`, active: true },
    { label: nav("tasks"), icon: ListChecks, href: `/${locale}/app/calendar` },
    { label: nav("stats"), icon: BarChart3, href: `/${locale}/app/stats` },
    { label: nav("audit"), icon: Activity, href: `/${locale}/app/audit` },
    { label: nav("settings"), icon: Settings, href: `/${locale}/app` },
  ];
  const [events, tasks] = activeHouseholdId
    ? await Promise.all([
        listCalendarEventsForHousehold(model.user.id, activeHouseholdId),
        listTasksForHousehold(model.user.id, activeHouseholdId),
      ])
    : [[], []];

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
            <nav aria-label={calendar("title")} className="grid gap-1">
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
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{calendar("title")}</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {identity("signedInAs", { name: model.user.displayName })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link href={`/${locale}/app`}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {calendar("backToDashboard")}
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
            <p className="mb-6 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              {calendar("hint")}
            </p>
            <CalendarWorkspace
              activeHouseholdId={activeHouseholdId}
              canCreateExpenseProposals={model.canCreateExpenseProposals}
              canCreateWorkItems={model.canCreateWorkItems}
              categories={model.categories.map((category) => ({
                id: category.id,
                name: locale === "zh-CN" ? category.nameZhCn : category.nameEn,
              }))}
              currentUserId={model.user.id}
              events={events.map(serializeCalendarEvent)}
              labels={{
                events: calendar("events"),
                eventsHint: calendar("eventsHint"),
                tasks: calendar("tasks"),
                tasksHint: calendar("tasksHint"),
                newEvent: calendar("newEvent"),
                newTask: calendar("newTask"),
                eventTitle: calendar("eventTitle"),
                taskTitle: calendar("taskTitle"),
                type: calendar("type"),
                priority: calendar("priority"),
                startAt: calendar("startAt"),
                endAt: calendar("endAt"),
                dueAt: calendar("dueAt"),
                description: calendar("description"),
                assignees: calendar("assignees"),
                allDay: calendar("allDay"),
                recurrence: calendar("recurrence"),
                recurrenceCount: calendar("recurrenceCount"),
                createEvent: calendar("createEvent"),
                createTask: calendar("createTask"),
                completeTask: calendar("completeTask"),
                eventCreated: calendar("eventCreated"),
                taskCreated: calendar("taskCreated"),
                taskCompleted: calendar("taskCompleted"),
                noEvents: calendar("noEvents"),
                noEventsInView: calendar("noEventsInView"),
                noTasks: calendar("noTasks"),
                noDueDate: calendar("noDueDate"),
                cannotCreate: calendar("cannotCreate"),
                noHousehold: identity("noHousehold"),
                working: common("working"),
                errorFallback: calendar("errorFallback"),
                linkedTask: calendar("linkedTask"),
                linkedExpenseProposal: calendar("linkedExpenseProposal"),
                createExpenseProposal: calendar("createExpenseProposal"),
                expenseProposalCreated: calendar("expenseProposalCreated"),
                openProposal: calendar("openProposal"),
                proposalTitle: expense("proposalTitle"),
                merchant: expense("merchant"),
                category: expense("category"),
                uncategorized: expense("uncategorized"),
                expenseDate: expense("expenseDate"),
                dueDate: expense("dueDate"),
                originalAmount: expense("originalAmount"),
                originalCurrency: expense("originalCurrency"),
                settlementCurrency: expense("settlementCurrency"),
                fxRate: expense("fxRate"),
                debtors: expense("debtors"),
                payerShareIncluded: expense("payerShareIncluded"),
                submitProposal: expense("submitProposal"),
                eventViewList: calendar("eventViewList"),
                eventViewWeek: calendar("eventViewWeek"),
                eventViewMonth: calendar("eventViewMonth"),
                eventTypes: {
                  TASK: calendar("eventTypeTask"),
                  CHORE: calendar("eventTypeChore"),
                  GROUP_ACTIVITY: calendar("eventTypeGroupActivity"),
                  BILL_DUE: calendar("eventTypeBillDue"),
                  REPAYMENT_DUE: calendar("eventTypeRepaymentDue"),
                  SETTLEMENT_REMINDER: calendar("eventTypeSettlementReminder"),
                  RECURRING_EXPENSE_GENERATION: calendar("eventTypeRecurringExpenseGeneration"),
                },
                priorities: {
                  LOW: calendar("priorityLow"),
                  NORMAL: calendar("priorityNormal"),
                  HIGH: calendar("priorityHigh"),
                },
                recurrences: {
                  NONE: calendar("recurrenceNone"),
                  DAILY: calendar("recurrenceDaily"),
                  WEEKLY: calendar("recurrenceWeekly"),
                  MONTHLY: calendar("recurrenceMonthly"),
                },
                statuses: {
                  OPEN: calendar("statusOpen"),
                  COMPLETED: calendar("statusCompleted"),
                },
              }}
              locale={locale}
              members={model.members.map((member) => ({
                userId: member.userId,
                displayName: member.displayNameOverride ?? member.user.displayName,
                email: member.user.email,
                role: member.role,
              }))}
              settlementCurrency={model.activeHousehold?.settlementCurrency ?? null}
              tasks={tasks.map(serializeTask)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
