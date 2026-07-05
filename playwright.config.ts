import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.ROOMPIRE_E2E_PORT ?? "3100";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const e2eWorkers = Number(process.env.ROOMPIRE_E2E_WORKERS ?? "1");
const e2eOpsStatusFile =
  process.env.ROOMPIRE_OPS_STATUS_FILE ??
  resolve(process.cwd(), "test-results/e2e-ops-status/ops-status.json");
const e2eWebPushPublicKey =
  "BLWLPeBEQMnSMUoWw9trJBrQ4Y-1YLMh0yHGGoHEpOn0froOtaAxy1vk-ojyQ0MQqKeHNs_lHkadpY_-f-3WhQ4";
const e2eWebPushPrivateKey = "0MH4IFLn4Wfr-BGwO0K-o5YtRjO7QRstseIcoqgzLIA";

process.env.ROOMPIRE_OPS_STATUS_FILE = e2eOpsStatusFile;

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
    command: `env -u NO_COLOR NODE_ENV=development ROOMPIRE_WEB_PUSH_PUBLIC_KEY=${e2eWebPushPublicKey} ROOMPIRE_WEB_PUSH_PRIVATE_KEY=${e2eWebPushPrivateKey} ROOMPIRE_WEB_PUSH_SUBJECT=mailto:e2e@roompire.test ROOMPIRE_WEB_PUSH_DELIVERY_MODE=dry-run sh -c 'pnpm e2e:prepare && pnpm --filter @roompire/web dev --hostname 127.0.0.1 --port ${e2ePort}'`,
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
