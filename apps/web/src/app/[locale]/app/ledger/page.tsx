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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SettlementActions } from "@/components/settlement-actions";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { getDashboardModel } from "@/server/dashboard/model";
import {
  serializeBalanceEdge,
  serializeLedgerObligation,
  serializeLedgerTransaction,
} from "@/server/ledger/serializers";
import {
  listBalanceEdgesForHousehold,
  listLedgerObligationsForHousehold,
  listLedgerTransactionsForHousehold,
} from "@/server/ledger/service";
import { serializeSettlement } from "@/server/settlements/serializers";
import { listSettlementsForHousehold } from "@/server/settlements/service";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

function memberName(memberNamesByUserId: Map<string, string>, userId: string) {
  return memberNamesByUserId.get(userId) ?? userId;
}

export default async function LedgerPage({ params }: PageProps) {
  const { locale } = await params;
  const nav = await getTranslations({ locale, namespace: "Nav" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const ledger = await getTranslations({ locale, namespace: "Ledger" });
  const identity = await getTranslations({ locale, namespace: "Identity" });
  const model = await getDashboardModel();
  const activeHouseholdName = model.activeHousehold?.name ?? ledger("title");
  const activeHouseholdId = model.activeHousehold?.id ?? null;

  const navItems = [
    { label: nav("dashboard"), icon: Home, href: `/${locale}/app` },
    { label: nav("expenses"), icon: ReceiptText, href: `/${locale}/app` },
    { label: nav("ledger"), icon: WalletCards, href: `/${locale}/app/ledger`, active: true },
    { label: nav("calendar"), icon: CalendarDays, href: `/${locale}/app` },
    { label: nav("tasks"), icon: ListChecks, href: `/${locale}/app` },
    { label: nav("audit"), icon: Activity, href: `/${locale}/app` },
    { label: nav("settings"), icon: Settings, href: `/${locale}/app` },
  ];
  const memberNamesByUserId = new Map(
    model.members.map((member) => [
      member.userId,
      member.displayNameOverride ?? member.user.displayName,
    ]),
  );
  const memberNamesByUserIdRecord = Object.fromEntries(memberNamesByUserId);
  const [balances, obligations, transactions, settlements] = activeHouseholdId
    ? await Promise.all([
        listBalanceEdgesForHousehold(model.user.id, activeHouseholdId),
        listLedgerObligationsForHousehold(model.user.id, activeHouseholdId),
        listLedgerTransactionsForHousehold(model.user.id, activeHouseholdId),
        listSettlementsForHousehold(model.user.id, activeHouseholdId),
      ])
    : [[], [], [], []];
  const serializedBalances = balances.map(serializeBalanceEdge);
  const serializedObligations = obligations.map(serializeLedgerObligation);
  const serializedOpenObligations = serializedObligations.filter(
    (obligation) => obligation.status === "OPEN",
  );
  const serializedTransactions = transactions.map(serializeLedgerTransaction);
  const serializedSettlements = settlements.map(serializeSettlement);

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
            <nav aria-label={ledger("title")} className="grid gap-1">
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
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{ledger("title")}</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {identity("signedInAs", { name: model.user.displayName })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link href={`/${locale}/app`}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {ledger("backToDashboard")}
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
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              {ledger("hint")}
            </p>

            <section className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">{ledger("balanceEdges")}</p>
                <p className="mt-3 text-2xl font-semibold">{serializedBalances.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">{ledger("openObligations")}</p>
                <p className="mt-3 text-2xl font-semibold">{serializedOpenObligations.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">{ledger("transactions")}</p>
                <p className="mt-3 text-2xl font-semibold">{serializedTransactions.length}</p>
              </div>
            </section>

            {activeHouseholdId ? (
              <SettlementActions
                currentUserId={model.user.id}
                householdId={activeHouseholdId}
                labels={{
                  settlementActions: ledger("settlementActions"),
                  settlementActionsHint: ledger("settlementActionsHint"),
                  recordSettlement: ledger("recordSettlement"),
                  amount: ledger("amount"),
                  date: ledger("date"),
                  method: ledger("method"),
                  note: ledger("note"),
                  submitSettlement: ledger("submitSettlement"),
                  settlementSubmitted: ledger("settlementSubmitted"),
                  pendingSettlements: ledger("pendingSettlements"),
                  pendingSettlementsHint: ledger("pendingSettlementsHint"),
                  confirmSettlement: ledger("confirmSettlement"),
                  rejectSettlement: ledger("rejectSettlement"),
                  settlementConfirmed: ledger("settlementConfirmed"),
                  settlementRejected: ledger("settlementRejected"),
                  noSettlementActions: ledger("noSettlementActions"),
                  noPendingSettlements: ledger("noPendingSettlements"),
                  manualMethod: ledger("manualMethod"),
                  payer: ledger("payer"),
                  payee: ledger("payee"),
                  remaining: ledger("remaining"),
                  working: common("working"),
                  errorFallback: ledger("settlementErrorFallback"),
                }}
                memberNamesByUserId={memberNamesByUserIdRecord}
                obligations={serializedObligations}
                settlements={serializedSettlements}
              />
            ) : null}

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="grid gap-6">
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-5">
                    <h2 className="text-lg font-semibold">{ledger("balanceEdges")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ledger("balanceEdgesHint")}
                    </p>
                  </div>
                  {serializedBalances.length > 0 ? (
                    <div className="divide-y divide-border">
                      {serializedBalances.map((balance) => (
                        <div
                          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          data-testid={`ledger-balance-${balance.debtorUserId}-${balance.creditorUserId}`}
                          key={`${balance.currency}-${balance.debtorUserId}-${balance.creditorUserId}`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {memberName(memberNamesByUserId, balance.debtorUserId)}{" "}
                              {ledger("owes")}{" "}
                              {memberName(memberNamesByUserId, balance.creditorUserId)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {balance.obligationCount} {ledger("obligations")}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">
                            {balance.currency} {balance.amount}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                      <WalletCards aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
                      <p className="mt-3 font-medium">{ledger("noBalances")}</p>
                      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                        {ledger("noBalancesHint")}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-5">
                    <h2 className="text-lg font-semibold">{ledger("openObligations")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ledger("openObligationsHint")}
                    </p>
                  </div>
                  {serializedOpenObligations.length > 0 ? (
                    <div className="divide-y divide-border">
                      {serializedOpenObligations.map((obligation) => (
                        <div
                          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          data-testid={`ledger-obligation-${obligation.id}`}
                          key={obligation.id}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {memberName(memberNamesByUserId, obligation.debtorUserId)}{" "}
                              {ledger("owes")}{" "}
                              {memberName(memberNamesByUserId, obligation.creditorUserId)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ledger("original")}: {obligation.originalCurrency}{" "}
                              {obligation.originalAmount} · {ledger("remaining")}:{" "}
                              {obligation.settlementCurrency} {obligation.remainingAmount}
                            </p>
                          </div>
                          <Badge variant="success">{obligation.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-5 text-sm text-muted-foreground">{ledger("noObligations")}</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border p-5">
                  <h2 className="text-lg font-semibold">{ledger("transactions")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{ledger("transactionsHint")}</p>
                </div>
                {serializedTransactions.length > 0 ? (
                  <ol className="divide-y divide-border">
                    {serializedTransactions.map((transaction) => (
                      <li className="grid gap-2 p-4" key={transaction.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {transaction.description ?? transaction.type}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ledger("occurred")}:{" "}
                              {new Date(transaction.occurredAt).toISOString().slice(0, 10)}
                            </p>
                          </div>
                          <Badge variant="neutral">{transaction.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {transaction.obligations.length} {ledger("obligations")} ·{" "}
                          {transaction.settlements.length} {ledger("settlements")}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="p-5 text-sm text-muted-foreground">{ledger("noTransactions")}</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
