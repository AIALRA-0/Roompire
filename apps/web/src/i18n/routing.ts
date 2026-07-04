export const locales = ["en-US", "zh-CN"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en-US";

export const routing = {
  locales,
  defaultLocale,
  localePrefix: "always",
} as const;

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}
