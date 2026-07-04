import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.ROOMPIRE_E2E_PORT ?? "3100";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const e2eWorkers = Number(process.env.ROOMPIRE_E2E_WORKERS ?? "1");

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: true,
  workers: e2eWorkers,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : [["list"], ["html"]],
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `env -u NO_COLOR NODE_ENV=development pnpm --filter @roompire/web dev --hostname 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: process.env.ROOMPIRE_E2E_REUSE_SERVER === "true",
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
