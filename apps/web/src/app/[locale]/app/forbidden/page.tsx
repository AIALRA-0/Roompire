import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function ForbiddenPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Forbidden" });

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <AlertTriangle aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("body")}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link href={`/${locale}/app`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
      </section>
    </main>
  );
}
