import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Home,
  ListChecks,
  Search,
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
import { serializeAuditEvent, serializeAuditHashChain } from "@/server/audit/serializers";
import {
  listAuditEventsForHousehold,
  verifyAuditHashChainForHousehold,
} from "@/server/audit/service";
import { getDashboardModel } from "@/server/dashboard/model";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function shortHash(value: string | null) {
  return value ? `${value.slice(0, 12)}...` : null;
}

export default async function AuditPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const rawSearchParams = await searchParams;
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
    { label: nav("stats"), icon: BarChart3, href: `/${locale}/app/stats` },
    { label: nav("audit"), icon: Activity, href: `/${locale}/app/audit`, active: true },
    { label: nav("settings"), icon: Settings, href: `/${locale}/app` },
  ];
  const memberNamesByUserId = new Map(
    model.members.map((member) => [
      member.userId,
      member.displayNameOverride ?? member.user.displayName,
    ]),
  );
  const filters = {
    action: firstSearchValue(rawSearchParams.action) ?? "",
    actorUserId: firstSearchValue(rawSearchParams.actorUserId) ?? "",
    entityId: firstSearchValue(rawSearchParams.entityId) ?? "",
    entityType: firstSearchValue(rawSearchParams.entityType) ?? "",
    from: firstSearchValue(rawSearchParams.from) ?? "",
    to: firstSearchValue(rawSearchParams.to) ?? "",
    limit: firstSearchValue(rawSearchParams.limit) ?? "50",
  };
  const [events, chain] = activeHouseholdId
    ? await Promise.all([
        listAuditEventsForHousehold(model.user.id, activeHouseholdId, filters).then((items) =>
          items.map(serializeAuditEvent),
        ),
        verifyAuditHashChainForHousehold(model.user.id, activeHouseholdId).then(
          serializeAuditHashChain,
        ),
      ])
    : [[], null];
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const limitOptions = ["25", "50", "100"];
  const chainStatusLabels = {
    VERIFIED: audit("chainVerified"),
    MISSING_HASHES: audit("chainMissingHashes"),
    BROKEN: audit("chainBroken"),
  };
  const chainVariant =
    chain?.status === "VERIFIED" ? "success" : chain?.status === "BROKEN" ? "danger" : "warning";

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
              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className="rounded-lg border border-border bg-card px-4 py-3"
                  data-testid="audit-event-count"
                >
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {audit("eventCount")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{events.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      {audit("chainStatus")}
                    </p>
                    {chain ? (
                      <Badge data-testid="audit-chain-status" variant={chainVariant}>
                        {chainStatusLabels[chain.status]}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {chain
                      ? audit("chainCoverage", {
                          hashed: chain.hashedEventCount,
                          total: chain.eventCount,
                        })
                      : audit("chainUnavailable")}
                  </p>
                  <p
                    className="mt-1 break-all text-xs text-muted-foreground"
                    data-testid="audit-chain-latest-hash"
                  >
                    {audit("latestHash")}:{" "}
                    {shortHash(chain?.latestEventHash ?? null) ?? audit("hashMissing")}
                  </p>
                </div>
              </div>
            </div>

            <section
              className="mb-6 rounded-lg border border-border bg-card"
              data-testid="audit-filter-form"
            >
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-semibold">{audit("filters")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{audit("filtersHint")}</p>
              </div>
              <form className="grid gap-4 p-5 lg:grid-cols-3" method="get">
                <label className="grid gap-2 text-sm font-medium">
                  {audit("filterAction")}
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="audit-filter-action"
                    defaultValue={filters.action}
                    name="action"
                    placeholder={audit("filterActionPlaceholder")}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {audit("filterEntityType")}
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="audit-filter-entity-type"
                    defaultValue={filters.entityType}
                    name="entityType"
                    placeholder={audit("filterEntityTypePlaceholder")}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {audit("filterActor")}
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="audit-filter-actor"
                    defaultValue={filters.actorUserId}
                    name="actorUserId"
                  >
                    <option value="">{audit("filterAnyActor")}</option>
                    {model.members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayNameOverride ?? member.user.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {audit("filterEntityId")}
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="audit-filter-entity-id"
                    defaultValue={filters.entityId}
                    name="entityId"
                    placeholder={audit("filterEntityIdPlaceholder")}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {audit("filterFrom")}
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="audit-filter-from"
                    defaultValue={filters.from}
                    name="from"
                    type="date"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {audit("filterTo")}
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="audit-filter-to"
                    defaultValue={filters.to}
                    name="to"
                    type="date"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {audit("filterLimit")}
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="audit-filter-limit"
                    defaultValue={limitOptions.includes(filters.limit) ? filters.limit : "50"}
                    name="limit"
                  >
                    {limitOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end gap-2 lg:col-span-2">
                  <Button data-testid="audit-filter-submit" type="submit">
                    <Search aria-hidden="true" className="h-4 w-4" />
                    {audit("applyFilters")}
                  </Button>
                  <Button asChild variant="outline">
                    <Link data-testid="audit-filter-clear" href={`/${locale}/app/audit`}>
                      {audit("clearFilters")}
                    </Link>
                  </Button>
                </div>
              </form>
            </section>

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
                          <p
                            className="min-w-0 break-all"
                            data-testid={`audit-event-hash-${event.id}`}
                          >
                            {audit("hash")}: {event.eventHash ?? audit("hashMissing")}
                          </p>
                          <p
                            className="min-w-0 break-all"
                            data-testid={`audit-event-prev-hash-${event.id}`}
                          >
                            {audit("previousHash")}: {event.prevHash ?? audit("genesisHash")}
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
