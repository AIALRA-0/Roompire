import createNextIntlPlugin from "next-intl/plugin";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
};

export default withNextIntl(nextConfig);
