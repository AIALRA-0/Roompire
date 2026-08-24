import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function LandingPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Landing" });
  const common = await getTranslations({ locale, namespace: "Common" });

  const proofItems = [t("proofOne"), t("proofTwo"), t("proofThree")];

  return (
    <main className="min-h-svh overflow-hidden">
      <section className="relative flex min-h-svh items-center px-5 py-5 sm:px-8">
        <div className="absolute inset-x-0 top-0 h-24 border-b border-border bg-background/85 backdrop-blur" />
        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:items-center">
          <div className="pt-20 lg:pt-0">
            <nav className="mb-14 flex items-center justify-between gap-4">
              <Link
                className="focus-ring inline-flex items-center gap-2 rounded-md text-sm font-semibold"
                href={`/${locale}`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  R
                </span>
                {common("product")}
              </Link>
              <LocaleSwitcher
                ariaLabel={common("language")}
                labels={{ "en-US": common("english"), "zh-CN": common("chinese") }}
                locale={locale}
              />
            </nav>

            <Badge className="mb-5" variant="success">
              <ShieldCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              {t("eyebrow")}
            </Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.03] tracking-normal text-foreground sm:text-6xl lg:text-7xl">
              {common("product")}
            </h1>
            <p className="mt-5 max-w-2xl text-balance text-2xl font-medium leading-tight text-foreground sm:text-3xl">
              {t("headline")}
            </p>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              {t("body")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/${locale}/app`}>
                  {t("primaryCta")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="https://github.com/AIALRA-0/Roompire/blob/HEAD/docs/01_project_plan.md">
                  <FileText aria-hidden="true" className="h-4 w-4" />
                  {t("secondaryCta")}
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative pb-6 pt-4 lg:py-16">
            <div className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t("workflowTitle")}</p>
                  <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
                    {t("workflowBody")}
                  </p>
                </div>
                <Badge variant="warning">{common("submitted")}</Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{t("proposalPreview")}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t("proposalStatus")}</p>
                    </div>
                    <Badge variant="neutral">USD 120.00</Badge>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {["Alice", "Bob", "Chen"].map((name, index) => (
                      <div
                        className="rounded-md border border-border bg-card px-3 py-2 text-xs"
                        key={name}
                      >
                        <p className="font-medium">{name}</p>
                        <p className="mt-1 text-muted-foreground">
                          {index === 0 ? t("payerPaid") : "40.00"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <LockKeyhole aria-hidden="true" className="h-4 w-4 text-primary" />
                      {t("fxPreview")}
                    </div>
                    <div className="mt-3 h-2 rounded-sm bg-muted">
                      <div className="h-2 w-2/3 rounded-sm bg-primary" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                      {t("ledgerPreview")}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CalendarDays aria-hidden="true" className="h-4 w-4 text-sky-600" />
                      {t("calendarPreview")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
                {proofItems.map((item) => (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground" key={item}>
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
