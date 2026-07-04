"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { locales, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type LocaleSwitcherProps = {
  locale: Locale;
  labels: Record<Locale, string>;
  ariaLabel: string;
};

export function LocaleSwitcher({ locale, labels, ariaLabel }: LocaleSwitcherProps) {
  const pathname = usePathname();

  function hrefFor(targetLocale: Locale) {
    const segments = pathname.split("/");
    segments[1] = targetLocale;
    return segments.join("/") || `/${targetLocale}`;
  }

  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-1"
      role="group"
    >
      <Languages aria-hidden="true" className="ml-2 h-4 w-4 text-muted-foreground" />
      {locales.map((targetLocale) => (
        <Link
          aria-current={locale === targetLocale ? "page" : undefined}
          className={cn(
            "rounded-sm px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            locale === targetLocale &&
              "bg-foreground text-background hover:bg-foreground hover:text-background",
          )}
          href={hrefFor(targetLocale)}
          key={targetLocale}
        >
          {labels[targetLocale]}
        </Link>
      ))}
    </div>
  );
}
