import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Home,
  ListChecks,
  ReceiptText,
  Settings,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { serializeAuditEvent } from "@/server/audit/serializers";
import { listAuditEventsForHousehold } from "@/server/audit/service";
import { getDashboardModel } from "@/server/dashboard/model";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

function jsonPreview(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

function actorName(memberNamesByUserId: Map<string, string>, actorUserId: string | null) {
  if (!actorUserId) {
    return null;
  }

  return memberNamesByUserId.get(actorUserId) ?? actorUserId;
}

export default async function AuditPage({ params }: PageProps) {
  const { locale } = await params;
  const nav = await getTranslations({ locale, namespace: "Nav" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const audit = await getTranslations({ locale, namespace: "Audit" });
  const model = await getDashboardModel();
  const activeHouseholdName = model.activeHousehold?.name ?? audit("title");
  const activeHouseholdId = model.activeHousehold?.id ?? null;
  const navItems = [
    { label: nav("dashboard"), icon: Home, href: `/${locale}/app` },
    { label: nav("expenses"), icon: ReceiptText, href: `/${locale}/app` },
    { label: nav("ledger"), icon: WalletCards, href: `/${locale}/app/ledger` },
    { label: nav("calendar"), icon: CalendarDays, href: `/${locale}/app/calendar` },
    { label: nav("tasks"), icon: ListChecks, href: `/${locale}/app/calendar` },
    { label: nav("audit"), icon: Activity, href: `/${locale}/app/audit`, active: true },
    { label: nav("settings"), icon: Settings, href: `/${locale}/app` },
  ];
  const memberNamesByUserId = new Map(
    model.members.map((member) => [
      member.userId,
      member.displayNameOverride ?? member.user.displayName,
    ]),
  );
  const events = activeHouseholdId
    ? (await listAuditEventsForHousehold(model.user.id, activeHouseholdId)).map(serializeAuditEvent)
    : [];
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
            <nav aria-label={audit("title")} className="grid gap-1">
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
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{audit("title")}</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {identity("signedInAs", { name: model.user.displayName })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link href={`/${locale}/app`}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {audit("backToDashboard")}
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
                {audit("hint")}
              </p>
              <div
                className="rounded-lg border border-border bg-card px-4 py-3"
                data-testid="audit-event-count"
              >
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {audit("eventCount")}
                </p>
                <p className="mt-1 text-2xl font-semibold">{events.length}</p>
              </div>
            </div>

            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-semibold">{audit("latestEvents")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{audit("latestEventsHint")}</p>
              </div>
              {events.length > 0 ? (
                <div className="divide-y divide-border">
                  {events.map((event) => {
                    const actor = actorName(memberNamesByUserId, event.actorUserId);
                    const before = jsonPreview(event.before);
                    const after = jsonPreview(event.after);
                    const metadata = jsonPreview(event.metadata);

                    return (
                      <article
                        className="grid gap-4 p-4"
                        data-testid={`audit-event-${event.id}`}
                        key={event.id}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3
                              className="break-words text-sm font-semibold"
                              data-testid={`audit-event-action-${event.id}`}
                            >
                              {event.action}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {audit("actor")}: {actor ?? audit("systemActor")} ·{" "}
                              {dateFormatter.format(new Date(event.occurredAt))}
                            </p>
                          </div>
                          <Badge variant="neutral">{event.entityType}</Badge>
                        </div>
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <p className="min-w-0 break-all">
                            {audit("entity")}: {event.entityId}
                          </p>
                          <p>
                            {audit("occurredAt")}: {event.occurredAt}
                          </p>
                        </div>
                        {before || after || metadata ? (
                          <div className="grid gap-3 lg:grid-cols-3">
                            {before ? (
                              <div className="min-w-0 rounded-md border border-border bg-background p-3">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {audit("before")}
                                </p>
                                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                                  {before}
                                </pre>
                              </div>
                            ) : null}
                            {after ? (
                              <div className="min-w-0 rounded-md border border-border bg-background p-3">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {audit("after")}
                                </p>
                                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                                  {after}
                                </pre>
                              </div>
                            ) : null}
                            {metadata ? (
                              <div className="min-w-0 rounded-md border border-border bg-background p-3">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {audit("metadata")}
                                </p>
                                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                                  {metadata}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
                  <Activity aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">{audit("noEvents")}</p>
                  <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                    {audit("noEventsHint")}
                  </p>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
