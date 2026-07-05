import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function clickMemberMutationWithRetry(
  page: Page,
  button: Locator,
  method: "PATCH" | "DELETE",
) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/households/") &&
        response.url().includes("/members/") &&
        response.request().method() === method,
    );

    await button.click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`${method} member mutation failed with status ${lastStatus}`);
}

async function clickOwnershipTransferWithRetry(page: Page, button: Locator) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/households/") &&
        response.url().includes("/members/") &&
        response.url().includes("/transfer-ownership") &&
        response.request().method() === "POST",
    );

    await button.click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Ownership transferred")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST ownership transfer failed with status ${lastStatus}`);
}

async function setDevSessionWithRetry(page: Page, email: string, displayName: string) {
  let lastStatus = 0;
  let lastError = "";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await page.request.post("/api/v1/dev/session", {
        data: {
          email,
          displayName,
        },
      });
      lastStatus = response.status();

      if (response.ok()) {
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`POST dev session failed with status ${lastStatus}: ${lastError}`);
}

async function postApiWithRetry(
  page: Page,
  url: string,
  options: Parameters<Page["request"]["post"]>[1],
) {
  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.request.post(url, options);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST ${url} failed: ${lastError}`);
}

async function getApiWithRetry(
  page: Page,
  url: string,
  options?: Parameters<Page["request"]["get"]>[1],
) {
  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.request.get(url, options);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`GET ${url} failed: ${lastError}`);
}

async function writeOpsStatusFixture() {
  const generatedAt = new Date().toISOString();
  const statusFilePath = process.env.ROOMPIRE_OPS_STATUS_FILE ?? "ops/status/ops-status.json";

  await mkdir(dirname(statusFilePath), { recursive: true });
  await writeFile(
    statusFilePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        source: "host_status_file",
        generatedAt,
        disk: {
          path: "/",
          sizeBytes: 100 * 1024 * 1024 * 1024,
          usedBytes: 42 * 1024 * 1024 * 1024,
          availableBytes: 58 * 1024 * 1024 * 1024,
          usedPercent: 42,
          status: "ok",
          checkedAt: generatedAt,
          error: null,
        },
        dockerStorage: {
          images: {
            totalCount: 4,
            activeCount: 3,
            sizeBytes: 2 * 1024 * 1024 * 1024,
            reclaimableBytes: 512 * 1024 * 1024,
            reclaimablePercent: 25,
          },
          containers: {
            totalCount: 3,
            activeCount: 3,
            sizeBytes: 256 * 1024 * 1024,
            reclaimableBytes: 0,
            reclaimablePercent: 0,
          },
          localVolumes: {
            totalCount: 3,
            activeCount: 2,
            sizeBytes: 768 * 1024 * 1024,
            reclaimableBytes: 256 * 1024 * 1024,
            reclaimablePercent: 33,
          },
          buildCache: {
            totalCount: 2,
            activeCount: 0,
            sizeBytes: 128 * 1024 * 1024,
            reclaimableBytes: 64 * 1024 * 1024,
            reclaimablePercent: null,
          },
          totalReclaimableBytes: 832 * 1024 * 1024,
          reclaimableWarningBytes: 5 * 1024 * 1024 * 1024,
          status: "ok",
          checkedAt: generatedAt,
          error: null,
        },
        opsStatusTimer: {
          name: "roompire-ops-status.timer",
          activeState: "active",
          enabledState: "enabled",
          nextElapse: "2026-07-05T04:45:00.000Z",
          lastTrigger: "2026-07-05T04:30:00.000Z",
          status: "ok",
          error: null,
        },
        opsStatusService: {
          name: "roompire-ops-status.service",
          activeState: "inactive",
          result: "success",
          execMainStatus: "0",
          startedAt: "2026-07-05T04:30:00.000Z",
          finishedAt: "2026-07-05T04:30:05.000Z",
          status: "ok",
          error: null,
        },
        backupTimer: {
          name: "roompire-backup.timer",
          activeState: "active",
          enabledState: "enabled",
          nextElapse: "2026-07-05T04:30:00.000Z",
          lastTrigger: "2026-07-04T04:30:00.000Z",
          status: "ok",
          error: null,
        },
        backupService: {
          name: "roompire-backup.service",
          activeState: "inactive",
          result: "success",
          execMainStatus: "0",
          startedAt: "2026-07-04T04:30:00.000Z",
          finishedAt: "2026-07-04T04:31:00.000Z",
          status: "ok",
          error: null,
        },
        housekeepingTimer: {
          name: "roompire-housekeeping.timer",
          activeState: "active",
          enabledState: "enabled",
          nextElapse: "2026-07-05T03:35:00.000Z",
          lastTrigger: "2026-07-04T03:35:00.000Z",
          status: "ok",
          error: null,
        },
        housekeepingService: {
          name: "roompire-housekeeping.service",
          activeState: "inactive",
          result: "success",
          execMainStatus: "0",
          startedAt: "2026-07-04T03:35:00.000Z",
          finishedAt: "2026-07-04T03:36:00.000Z",
          status: "ok",
          error: null,
        },
        backupEncryption: {
          backupRoot: "/srv/aialra/backups/roompire",
          configured: "enabled",
          passphraseFileConfigured: true,
          passphraseFileExists: true,
          encryptedArtifacts: 3,
          plaintextArtifacts: 0,
          missingSha256Sidecars: 0,
          latestEncryptedArtifact:
            "/srv/aialra/backups/roompire/postgres/roompire_20260704T235250Z.dump.enc",
          status: "ok",
          checkedAt: generatedAt,
          error: null,
        },
        backupOffsite: {
          mode: "local",
          configured: true,
          targetConfigured: true,
          target: "local:/mnt/roompire-offsite",
          statusFile: "ops/status/backup-offsite.json",
          lastSyncAt: generatedAt,
          artifactCount: 6,
          totalBytes: 123456789,
          latestArtifact:
            "/srv/aialra/backups/roompire/postgres/roompire_20260704T235250Z.dump.enc.sha256",
          status: "ok",
          checkedAt: generatedAt,
          error: null,
        },
        smokeTimer: {
          name: "roompire-smoke.timer",
          activeState: "active",
          enabledState: "enabled",
          nextElapse: "2026-07-05T05:07:00.000Z",
          lastTrigger: "2026-07-05T04:07:00.000Z",
          status: "ok",
          error: null,
        },
        smokeService: {
          name: "roompire-smoke.service",
          activeState: "inactive",
          result: "success",
          execMainStatus: "0",
          startedAt: "2026-07-05T04:07:00.000Z",
          finishedAt: "2026-07-05T04:07:02.000Z",
          status: "ok",
          error: null,
        },
        latestSmoke: {
          status: "passed",
          generatedAt,
          baseUrl: "https://roompire.aialra.online",
          checks: [
            { path: "/en-US", status: "passed", httpStatus: 200, message: null },
            { path: "/api/v1/health", status: "passed", httpStatus: 200, message: null },
            { path: "/manifest.webmanifest", status: "passed", httpStatus: 200, message: null },
          ],
          failedPath: null,
          message: null,
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function clickInviteCreateWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/households/") &&
        response.url().includes("/invites") &&
        response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Create invite" }).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Invite created")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST invite failed with status ${lastStatus}`);
}

async function clickHouseholdCreateWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/households") && response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Create household" }).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Household created")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST household failed with status ${lastStatus}`);
}

async function createInviteWithRetry(
  page: Page,
  householdId: string,
  data: { email: string; role: "ADMIN" | "MEMBER" | "VIEWER" },
  actorEmail?: string,
) {
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.post(`/api/v1/households/${householdId}/invites`, {
      data,
      headers: actorEmail
        ? {
            "x-roompire-dev-user-email": actorEmail,
          }
        : undefined,
    });
    lastStatus = response.status();
    lastBody = await response.text();

    if (response.ok()) {
      return JSON.parse(lastBody) as { token: string };
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST invite API failed with status ${lastStatus}: ${lastBody}`);
}

async function clickExpenseProposalSubmitWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/households/") &&
        response.url().includes("/expenses/proposals") &&
        response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Submit proposal" }).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Proposal submitted")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST expense proposal failed with status ${lastStatus}`);
}

async function clickShareApproveWithRetry(page: Page, shareId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/expenses/shares/${shareId}/approve`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`share-approve-${shareId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Share approved and added to the ledger")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST share approve failed with status ${lastStatus}`);
}

async function clickShareRejectWithRetry(page: Page, shareId: string, reason: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/expenses/shares/${shareId}/reject`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`share-reject-reason-${shareId}`).fill(reason);
    await page.getByTestId(`share-reject-${shareId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Share rejected")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST share reject failed with status ${lastStatus}`);
}

async function clickShareRequestChangesWithRetry(page: Page, shareId: string, reason: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/expenses/shares/${shareId}/request-changes`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`share-reject-reason-${shareId}`).fill(reason);
    await page.getByTestId(`share-request-changes-${shareId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Changes requested")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST share request changes failed with status ${lastStatus}`);
}

async function clickSettlementSubmitWithRetry(page: Page, obligationId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const pathname = new URL(response.url()).pathname;

      return pathname.endsWith("/settlements") && response.request().method() === "POST";
    });

    await page.getByTestId(`settlement-submit-${obligationId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Settlement submitted")).toBeVisible();
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`POST settlement failed with status ${lastStatus}`);
}

async function clickSuggestedSettlementSubmitWithRetry(page: Page, transferKey: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const pathname = new URL(response.url()).pathname;

      return pathname.endsWith("/settlements") && response.request().method() === "POST";
    });

    await page.getByTestId(`suggested-settlement-submit-${transferKey}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Settlement submitted")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST suggested settlement failed with status ${lastStatus}`);
}

async function clickSettlementConfirmWithRetry(page: Page, settlementId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/settlements/${settlementId}/confirm`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`settlement-confirm-${settlementId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Settlement confirmed")).toBeVisible();
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`POST settlement confirm failed with status ${lastStatus}`);
}

async function clickLedgerAdjustmentSubmitWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/ledger/adjustments") && response.request().method() === "POST",
    );

    await page.getByTestId("ledger-adjustment-submit").click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Adjustment created")).toBeVisible();
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`POST ledger adjustment failed with status ${lastStatus}`);
}

async function clickLedgerReversalSubmitWithRetry(page: Page, obligationId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/ledger/obligations/${obligationId}/reverse`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`ledger-reversal-submit-${obligationId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Obligation reversed")).toBeVisible();
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`POST ledger reversal failed with status ${lastStatus}`);
}

async function clickCalendarEventSubmitWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const pathname = new URL(response.url()).pathname;

      return pathname.endsWith("/calendar/events") && response.request().method() === "POST";
    });

    await page.getByTestId("calendar-event-submit").click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Calendar event created")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST calendar event failed with status ${lastStatus}`);
}

async function clickTaskSubmitWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const pathname = new URL(response.url()).pathname;

      return pathname.endsWith("/tasks") && response.request().method() === "POST";
    });

    await page.getByTestId("task-submit").click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Task created")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST task failed with status ${lastStatus}`);
}

async function clickTaskCompleteWithRetry(page: Page, taskId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/tasks/${taskId}/complete`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`task-complete-${taskId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Task completed")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST task complete failed with status ${lastStatus}`);
}

async function clickTaskExpenseProposalSubmitWithRetry(page: Page, taskId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/tasks/${taskId}/create-expense-proposal`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`task-expense-submit-${taskId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Expense proposal created")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST task expense proposal failed with status ${lastStatus}`);
}

async function clickEventExpenseProposalSubmitWithRetry(page: Page, eventId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/calendar/events/${eventId}/create-expense-proposal`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId(`event-expense-submit-${eventId}`).click();
    const response = await responsePromise;
    lastStatus = response.status();

    if (response.ok()) {
      await expect(page.getByText("Expense proposal created")).toBeVisible();
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`POST event expense proposal failed with status ${lastStatus}`);
}

async function postViewerCalendarEventWithRetry(
  page: Page,
  householdId: string,
  viewerEmail: string,
  title: string,
) {
  let lastStatus = 0;
  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await page.request.post(
        `/api/v1/households/${householdId}/calendar/events`,
        {
          data: {
            title,
            type: "GROUP_ACTIVITY",
            startAt: "2026-07-09T09:00:00.000Z",
          },
          headers: {
            "Idempotency-Key": `viewer-calendar-${Date.now()}-${attempt}`,
            "x-roompire-dev-user-email": viewerEmail,
          },
        },
      );

      lastStatus = response.status();

      if (lastStatus === 403) {
        return lastStatus;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Viewer calendar API status ${lastStatus}: ${lastError}`);
}

function parseProposalDetailUrl(url: string) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/households\/([^/]+)\/expenses\/proposals\/([^/]+)/);

  if (!match) {
    throw new Error(`Unexpected proposal detail URL: ${url}`);
  }

  return {
    householdId: match[1]!,
    proposalId: match[2]!,
  };
}

test.describe("Roompire real browser smoke", () => {
  test.beforeEach(async ({ page }) => {
    await setDevSessionWithRetry(page, "alice@example.test", "Alice");
  });

  test("desktop user opens landing page and navigates to dashboard", async ({ page }) => {
    await page.goto("/en-US");

    await expect(page.getByRole("heading", { name: "Roompire" })).toBeVisible();
    await expect(page.getByText("No formal debt until approval")).toBeVisible();

    await Promise.all([
      page.waitForURL("**/en-US/app"),
      page
        .getByRole("link", { name: /Open dashboard/ })
        .first()
        .click(),
    ]);

    await expect(page.getByText("Pending proposals")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Formal balances" })).toBeVisible();
    await expect(page.getByText("No approved obligations yet")).toBeVisible();

    const sessionResponse = await getApiWithRetry(page, "/api/v1/session");
    expect(sessionResponse.ok()).toBeTruthy();
    const sessionPayload = (await sessionResponse.json()) as {
      household: { id: string } | null;
    };
    expect(sessionPayload.household?.id).toBeTruthy();

    const statsSummaryResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/summary`,
    );
    expect(statsSummaryResponse.ok()).toBeTruthy();
    const statsSummaryPayload = (await statsSummaryResponse.json()) as {
      summary: {
        window: { from: string | null; to: string | null };
        proposalCounts: { SUBMITTED: number };
        proposalSettlementTotals: Array<{ currency: string; amount: string }>;
        proposalTrend: Array<{
          date: string;
          proposalCount: number;
          proposalTotals: Array<{ currency: string; amount: string }>;
        }>;
        taskCounts: { open: number; completed: number };
        auditEventCount: number;
      };
    };
    expect(statsSummaryPayload.summary.window).toEqual({ from: null, to: null });
    expect(statsSummaryPayload.summary.proposalCounts.SUBMITTED).toBeGreaterThan(0);
    expect(statsSummaryPayload.summary.proposalSettlementTotals).toContainEqual(
      expect.objectContaining({ currency: "CNY" }),
    );
    expect(statsSummaryPayload.summary.proposalTrend).toContainEqual(
      expect.objectContaining({
        date: "2026-07-01",
        proposalCount: expect.any(Number),
      }),
    );
    expect(statsSummaryPayload.summary.auditEventCount).toBeGreaterThan(0);

    const filteredStatsSummaryResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/summary?from=2026-07-01&to=2026-07-01`,
    );
    expect(filteredStatsSummaryResponse.ok()).toBeTruthy();
    const filteredStatsSummaryPayload =
      (await filteredStatsSummaryResponse.json()) as typeof statsSummaryPayload;
    expect(filteredStatsSummaryPayload.summary.window).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    });
    expect(filteredStatsSummaryPayload.summary.proposalCounts.SUBMITTED).toBeGreaterThan(0);
    expect(filteredStatsSummaryPayload.summary.proposalTrend).toContainEqual(
      expect.objectContaining({
        date: "2026-07-01",
        proposalCount: expect.any(Number),
      }),
    );

    const emptyStatsSummaryResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/summary?from=2030-01-01&to=2030-01-31`,
    );
    expect(emptyStatsSummaryResponse.ok()).toBeTruthy();
    const emptyStatsSummaryPayload =
      (await emptyStatsSummaryResponse.json()) as typeof statsSummaryPayload;
    expect(emptyStatsSummaryPayload.summary.proposalCounts.SUBMITTED).toBe(0);
    expect(emptyStatsSummaryPayload.summary.proposalTrend).toHaveLength(0);

    const invalidStatsSummaryResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/summary?from=2026-02-31`,
    );
    expect(invalidStatsSummaryResponse.status()).toBe(400);

    const statsCategoriesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/categories`,
    );
    expect(statsCategoriesResponse.ok()).toBeTruthy();
    const statsCategoriesPayload = (await statsCategoriesResponse.json()) as {
      categories: Array<{ categoryKey: string; proposalCount: number }>;
    };
    expect(statsCategoriesPayload.categories).toContainEqual(
      expect.objectContaining({ categoryKey: "groceries" }),
    );
    const filteredStatsCategoriesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/categories?from=2026-07-01&to=2026-07-01`,
    );
    expect(filteredStatsCategoriesResponse.ok()).toBeTruthy();
    const filteredStatsCategoriesPayload =
      (await filteredStatsCategoriesResponse.json()) as typeof statsCategoriesPayload;
    expect(filteredStatsCategoriesPayload.categories).toContainEqual(
      expect.objectContaining({ categoryKey: "groceries" }),
    );

    const statsMembersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/members`,
    );
    expect(statsMembersResponse.ok()).toBeTruthy();
    const statsMembersPayload = (await statsMembersResponse.json()) as {
      members: Array<{ email: string; createdProposalCount: number }>;
    };
    expect(statsMembersPayload.members).toContainEqual(
      expect.objectContaining({ email: "alice@example.test" }),
    );
    const emptyStatsMembersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/stats/members?from=2030-01-01&to=2030-01-31`,
    );
    expect(emptyStatsMembersResponse.ok()).toBeTruthy();
    const emptyStatsMembersPayload =
      (await emptyStatsMembersResponse.json()) as typeof statsMembersPayload;
    expect(emptyStatsMembersPayload.members).toContainEqual(
      expect.objectContaining({
        email: "alice@example.test",
        createdProposalCount: 0,
      }),
    );

    await expect(page.getByTestId("dashboard-stats-link")).toHaveAttribute(
      "href",
      "/en-US/app/stats",
    );
    await page.goto("/en-US/app/stats");

    await expect(page.getByRole("heading", { name: "Household statistics" })).toBeVisible();
    await expect(page.getByTestId("stats-filter-form")).toBeVisible();
    await expect(page.getByTestId("stats-window-label")).toContainText("All time");
    await expect(page.getByTestId("stats-summary-proposals")).toBeVisible();
    await expect(page.getByTestId("stats-summary-audit")).toBeVisible();
    await expect(page.getByTestId("stats-proposal-trend")).toBeVisible();
    await expect(page.getByTestId("stats-trend-row-2026-07-01")).toBeVisible();
    await expect(page.getByTestId("export-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Category breakdown" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Member breakdown" })).toBeVisible();

    await page.goto("/en-US/app/stats?from=2026-07-01&to=2026-07-01");
    await expect(page.getByTestId("stats-filter-from")).toHaveValue("2026-07-01");
    await expect(page.getByTestId("stats-filter-to")).toHaveValue("2026-07-01");
    await expect(page.getByTestId("stats-window-label")).toContainText("2026-07-01 to 2026-07-01");
    await expect(page.getByTestId("stats-trend-row-2026-07-01")).toBeVisible();
    await page.getByTestId("stats-filter-from").fill("2030-01-01");
    await page.getByTestId("stats-filter-to").fill("2030-01-31");
    await Promise.all([
      page.waitForURL(/\/en-US\/app\/stats\?from=2030-01-01&to=2030-01-31/),
      page.getByTestId("stats-filter-submit").click(),
    ]);
    await expect(page.getByText("No proposal activity in this window")).toBeVisible();
    await Promise.all([
      page.waitForURL("**/en-US/app/stats"),
      page.getByTestId("stats-filter-clear").click(),
    ]);

    const auditExportResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/exports`,
      {
        data: {
          dataset: "audit_events",
          format: "json",
        },
      },
    );
    expect(auditExportResponse.status()).toBe(201);
    const auditExportPayload = (await auditExportResponse.json()) as {
      export: { downloadUrl: string; dataset: string; format: string; status: string };
    };
    expect(auditExportPayload.export).toEqual(
      expect.objectContaining({
        dataset: "audit_events",
        format: "json",
        status: "READY",
      }),
    );
    const auditExportDownload = await getApiWithRetry(page, auditExportPayload.export.downloadUrl);
    expect(auditExportDownload.ok()).toBeTruthy();
    expect(auditExportDownload.headers()["content-disposition"]).toContain("roompire-audit_events");
    const auditExportBody = (await auditExportDownload.json()) as {
      records: Array<{ action: string }>;
    };
    expect(auditExportBody.records).toContainEqual(
      expect.objectContaining({ action: "export.created" }),
    );

    const expenseCsvExportResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/exports`,
      {
        data: {
          dataset: "expense_proposals",
          format: "csv",
        },
      },
    );
    expect(expenseCsvExportResponse.status()).toBe(201);
    const expenseCsvExportPayload = (await expenseCsvExportResponse.json()) as {
      export: { downloadUrl: string };
    };
    const expenseCsvDownload = await getApiWithRetry(
      page,
      expenseCsvExportPayload.export.downloadUrl,
    );
    expect(expenseCsvDownload.ok()).toBeTruthy();
    expect(expenseCsvDownload.headers()["content-type"]).toContain("text/csv");
    expect(await expenseCsvDownload.text()).toContain("Costco groceries");

    const auditResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/audit-events`,
    );
    expect(auditResponse.ok()).toBeTruthy();
    const auditPayload = (await auditResponse.json()) as {
      events: Array<{
        id: string;
        action: string;
        entityType: string;
        occurredAt: string;
        eventHash: string | null;
        prevHash: string | null;
      }>;
      chain: {
        status: "VERIFIED" | "MISSING_HASHES" | "BROKEN";
        eventCount: number;
        hashedEventCount: number;
        latestEventHash: string | null;
      };
    };
    expect(auditPayload.events.length).toBeGreaterThan(0);
    expect(auditPayload.chain.status).toBe("VERIFIED");
    expect(auditPayload.chain.hashedEventCount).toBe(auditPayload.chain.eventCount);
    expect(auditPayload.chain.latestEventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(auditPayload.events[0]?.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(auditPayload.events).toContainEqual(
      expect.objectContaining({
        action: "expense_proposal.seeded",
        entityType: "ExpenseProposal",
      }),
    );

    const filteredAuditResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/audit-events?action=export.created&entityType=Export&limit=25`,
    );
    expect(filteredAuditResponse.ok()).toBeTruthy();
    const filteredAuditPayload = (await filteredAuditResponse.json()) as {
      events: Array<{ action: string; entityType: string }>;
    };
    expect(filteredAuditPayload.events.length).toBeGreaterThan(0);
    expect(filteredAuditPayload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "export.created",
          entityType: "Export",
        }),
      ]),
    );

    await page.goto("/en-US/app");
    await expect(page.getByText("Pending proposals")).toBeVisible();
    await expect(page.getByTestId("dashboard-audit-link")).toHaveAttribute(
      "href",
      "/en-US/app/audit",
    );
    await page.goto("/en-US/app/audit");

    await expect(page.getByRole("heading", { name: "Audit trail" })).toBeVisible();
    await expect(page.getByTestId("audit-event-count")).toBeVisible();
    await expect(page.getByTestId("audit-chain-status")).toContainText("Verified");
    await expect(page.getByText("expense_proposal.seeded")).toBeVisible();
    await expect(page.getByTestId(`audit-event-hash-${auditPayload.events[0]!.id}`)).toContainText(
      /[0-9a-f]{64}/,
    );

    await page.goto("/en-US/app/audit?action=export.created&entityType=Export&limit=25");
    await expect(page.getByTestId("audit-filter-form")).toBeVisible();
    await expect(page.getByTestId("audit-filter-action")).toHaveValue("export.created");
    await expect(page.getByTestId("audit-filter-entity-type")).toHaveValue("Export");
    await expect(page.getByText("export.created").first()).toBeVisible();
    await expect(page.getByText("Export").first()).toBeVisible();

    const guidanceMembersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/members`,
      {
        headers: {
          "x-roompire-dev-user-email": "alice@example.test",
        },
      },
    );
    expect(guidanceMembersResponse.ok()).toBeTruthy();
    const guidanceMembersPayload = (await guidanceMembersResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
    };
    const aliceUserId = guidanceMembersPayload.members.find(
      (member) => member.email === "alice@example.test",
    )?.userId;
    const bobUserId = guidanceMembersPayload.members.find(
      (member) => member.email === "bob@example.test",
    )?.userId;
    const chenUserId = guidanceMembersPayload.members.find(
      (member) => member.email === "chen@example.test",
    )?.userId;
    expect(aliceUserId).toBeTruthy();
    expect(bobUserId).toBeTruthy();
    expect(chenUserId).toBeTruthy();
    if (!aliceUserId || !bobUserId || !chenUserId) {
      throw new Error("Expected seeded Alice, Bob, and Chen users for guidance-only settlement.");
    }

    const guidanceId = Date.now();
    const bobToAliceAdjustment = await postApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/ledger/adjustments`,
      {
        data: {
          debtorUserId: bobUserId,
          creditorUserId: aliceUserId,
          amount: "10",
          currency: "CNY",
          occurredAt: "2026-07-04",
          reason: "Guidance-only chain Bob to Alice",
        },
        headers: {
          "Idempotency-Key": `guidance-bob-alice-${guidanceId}`,
          "x-roompire-dev-user-email": "alice@example.test",
        },
      },
    );
    expect(bobToAliceAdjustment.status()).toBe(201);
    const bobToAliceAdjustmentPayload = (await bobToAliceAdjustment.json()) as {
      transaction: { obligations: Array<{ id: string }> };
    };
    const bobToAliceObligationId = bobToAliceAdjustmentPayload.transaction.obligations[0]?.id;
    expect(bobToAliceObligationId).toBeTruthy();
    const aliceToChenAdjustment = await postApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/ledger/adjustments`,
      {
        data: {
          debtorUserId: aliceUserId,
          creditorUserId: chenUserId,
          amount: "10",
          currency: "CNY",
          occurredAt: "2026-07-04",
          reason: "Guidance-only chain Alice to Chen",
        },
        headers: {
          "Idempotency-Key": `guidance-alice-chen-${guidanceId}`,
          "x-roompire-dev-user-email": "alice@example.test",
        },
      },
    );
    expect(aliceToChenAdjustment.status()).toBe(201);
    const aliceToChenAdjustmentPayload = (await aliceToChenAdjustment.json()) as {
      transaction: { obligations: Array<{ id: string }> };
    };
    const aliceToChenObligationId = aliceToChenAdjustmentPayload.transaction.obligations[0]?.id;
    expect(aliceToChenObligationId).toBeTruthy();
    if (!bobToAliceObligationId || !aliceToChenObligationId) {
      throw new Error("Expected guidance-only adjustment obligations to be returned.");
    }

    const guidanceSuggestionsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/settlement-suggestions`,
      {
        headers: {
          "x-roompire-dev-user-email": "bob@example.test",
        },
      },
    );
    expect(guidanceSuggestionsResponse.ok()).toBeTruthy();
    const guidanceSuggestionsPayload = (await guidanceSuggestionsResponse.json()) as {
      suggestions: Array<{
        debtorUserId: string;
        creditorUserId: string;
        amount: string;
        currency: string;
        directOpenObligationCount: number;
        directRemainingAmount: string;
        actionability: "DIRECTLY_SETTLEABLE" | "CLEARING_SETTLEABLE" | "GUIDANCE_ONLY";
      }>;
    };
    expect(guidanceSuggestionsPayload.suggestions).toContainEqual(
      expect.objectContaining({
        debtorUserId: bobUserId,
        creditorUserId: chenUserId,
        amount: "10",
        currency: "CNY",
        directOpenObligationCount: 0,
        directRemainingAmount: "0",
        actionability: "GUIDANCE_ONLY",
      }),
    );

    const guidanceTransferKey = `${bobUserId}-${chenUserId}-CNY`;
    await setDevSessionWithRetry(page, "bob@example.test", "Bob");
    await page.goto("/en-US/app/ledger");
    const guidanceSuggestionRow = page.getByTestId(`settlement-suggestion-${guidanceTransferKey}`);
    await expect(guidanceSuggestionRow).toContainText("Bob pays Chen");
    await expect(guidanceSuggestionRow).toContainText(
      "Guidance only until a household clearing policy is enabled.",
    );
    await expect(
      page.getByTestId(`settlement-suggestion-actionability-${guidanceTransferKey}`),
    ).toContainText("CNY 10");
    await expect(page.getByTestId(`suggested-settlement-form-${guidanceTransferKey}`)).toHaveCount(
      0,
    );

    const guidanceSettlementResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${sessionPayload.household!.id}/settlements`,
      {
        data: {
          payeeUserId: chenUserId,
          currency: "CNY",
          amount: "10",
          settlementDate: "2026-07-04",
          method: "manual",
        },
        headers: {
          "Idempotency-Key": `guidance-settlement-${guidanceId}`,
          "x-roompire-dev-user-email": "bob@example.test",
        },
      },
    );
    expect(guidanceSettlementResponse.status()).toBe(409);
    const guidanceSettlementPayload = (await guidanceSettlementResponse.json()) as {
      error: { code: string };
    };
    expect(guidanceSettlementPayload.error.code).toBe("NO_SETTLEABLE_OBLIGATIONS");

    for (const [obligationId, reason] of [
      [aliceToChenObligationId, "Clean up guidance-only Alice to Chen adjustment"],
      [bobToAliceObligationId, "Clean up guidance-only Bob to Alice adjustment"],
    ] as const) {
      const reversalResponse = await postApiWithRetry(
        page,
        `/api/v1/households/${sessionPayload.household!.id}/ledger/obligations/${obligationId}/reverse`,
        {
          data: {
            reason,
            occurredAt: "2026-07-04",
          },
          headers: {
            "Idempotency-Key": `guidance-reversal-${obligationId}-${guidanceId}`,
            "x-roompire-dev-user-email": "alice@example.test",
          },
        },
      );
      expect(reversalResponse.ok()).toBeTruthy();
    }
  });

  test("mobile user sees zh-CN shell and protected-route failure state", async ({ page }) => {
    await page.goto("/zh-CN");

    await expect(page.getByRole("heading", { name: "Roompire" })).toBeVisible();
    await expect(page.getByText("审批前不形成正式债务")).toBeVisible();

    await Promise.all([
      page.waitForURL("**/zh-CN/app"),
      page
        .getByRole("link", { name: /打开工作台/ })
        .first()
        .click(),
    ]);

    await expect(page.getByText("待审批提案")).toBeVisible();
    await expect(page.getByRole("heading", { name: "正式余额" })).toBeVisible();
    await expect(page.getByText("暂无已批准债务")).toBeVisible();

    await page.goto("/zh-CN/app/forbidden");
    await expect(page.getByRole("heading", { name: "需要访问权限" })).toBeVisible();
    await expect(page.getByRole("link", { name: /返回工作台/ })).toBeVisible();
  });

  test("owner reviews ops health and viewer is blocked", async ({ page }) => {
    await writeOpsStatusFixture();
    await page.goto("/en-US/app");
    await expect(page.getByTestId("dashboard-ops-link")).toHaveAttribute("href", "/en-US/app/ops");

    await Promise.all([
      page.waitForURL("**/en-US/app/ops"),
      page.getByTestId("dashboard-ops-link").click(),
    ]);

    await expect(page.getByRole("heading", { name: "Ops health" })).toBeVisible();
    await expect(page.getByTestId("ops-summary-status")).toContainText("OK");
    await expect(page.getByTestId("ops-disk-card")).toContainText("58 GB");
    await expect(page.getByTestId("ops-docker-status")).toContainText("OK");
    await expect(page.getByTestId("ops-docker-reclaimable")).toContainText("832 MB");
    await expect(page.getByTestId("ops-docker-images")).toContainText("3/4 active");
    await expect(page.getByTestId("ops-docker-images-reclaimable")).toContainText("512 MB");
    await expect(page.getByTestId("ops-backup-timer-status")).toContainText("OK");
    await expect(page.getByTestId("ops-housekeeping-timer-status")).toContainText("OK");
    await expect(page.getByTestId("ops-backup-encryption-status")).toContainText("OK");
    await expect(page.getByTestId("ops-backup-encryption-mode")).toContainText("Enabled");
    await expect(page.getByTestId("ops-backup-plaintext-artifacts")).toContainText("0");
    await expect(page.getByTestId("ops-backup-offsite-status")).toContainText("OK");
    await expect(page.getByTestId("ops-backup-offsite-mode")).toContainText("Local mount");
    await expect(page.getByTestId("ops-backup-offsite-artifacts")).toContainText("6");
    await expect(page.getByTestId("ops-smoke-status")).toContainText("Passed");
    await expect(page.getByTestId("ops-smoke-timer-status")).toContainText("OK");
    await expect(page.getByTestId("ops-status-timer-status")).toContainText("OK");
    await expect(page.getByTestId("ops-status-file-card")).toContainText("Loaded");

    const opsResponse = await getApiWithRetry(page, "/api/v1/ops/status");
    expect(opsResponse.ok()).toBeTruthy();
    const opsPayload = (await opsResponse.json()) as {
      status: {
        source: string;
        summary: { status: string; warnings: string[] };
        dockerStorage: {
          totalReclaimableBytes: number;
          status: string;
          images: { totalCount: number; activeCount: number };
        };
        opsStatusTimer: { activeState: string; enabledState: string };
        opsStatusService: { result: string; execMainStatus: string };
        housekeepingTimer: { activeState: string; enabledState: string };
        housekeepingService: { result: string; execMainStatus: string };
        backupEncryption: {
          configured: string;
          encryptedArtifacts: number;
          plaintextArtifacts: number;
        };
        backupOffsite: {
          mode: string;
          configured: boolean;
          artifactCount: number;
          status: string;
        };
        smokeTimer: { activeState: string; enabledState: string };
        smokeService: { result: string; execMainStatus: string };
        latestSmoke: { status: string; checks: Array<{ path: string }> };
      };
    };
    expect(opsPayload.status.source).toBe("host_status_file");
    expect(opsPayload.status.summary).toEqual({ status: "ok", warnings: [] });
    expect(opsPayload.status.dockerStorage).toEqual(
      expect.objectContaining({
        totalReclaimableBytes: 832 * 1024 * 1024,
        status: "ok",
        images: expect.objectContaining({ totalCount: 4, activeCount: 3 }),
      }),
    );
    expect(opsPayload.status.opsStatusTimer).toEqual(
      expect.objectContaining({ activeState: "active", enabledState: "enabled" }),
    );
    expect(opsPayload.status.opsStatusService).toEqual(
      expect.objectContaining({ result: "success", execMainStatus: "0" }),
    );
    expect(opsPayload.status.housekeepingTimer).toEqual(
      expect.objectContaining({ activeState: "active", enabledState: "enabled" }),
    );
    expect(opsPayload.status.housekeepingService).toEqual(
      expect.objectContaining({ result: "success", execMainStatus: "0" }),
    );
    expect(opsPayload.status.backupEncryption).toEqual(
      expect.objectContaining({
        configured: "enabled",
        encryptedArtifacts: 3,
        plaintextArtifacts: 0,
      }),
    );
    expect(opsPayload.status.backupOffsite).toEqual(
      expect.objectContaining({
        mode: "local",
        configured: true,
        artifactCount: 6,
        status: "ok",
      }),
    );
    expect(opsPayload.status.smokeTimer).toEqual(
      expect.objectContaining({ activeState: "active", enabledState: "enabled" }),
    );
    expect(opsPayload.status.smokeService).toEqual(
      expect.objectContaining({ result: "success", execMainStatus: "0" }),
    );
    expect(opsPayload.status.latestSmoke).toEqual(
      expect.objectContaining({
        status: "passed",
        checks: expect.arrayContaining([expect.objectContaining({ path: "/api/v1/health" })]),
      }),
    );

    const viewerOpsResponse = await getApiWithRetry(page, "/api/v1/ops/status", {
      headers: {
        "x-roompire-dev-user-email": "dana@example.test",
      },
    });
    expect(viewerOpsResponse.status()).toBe(403);

    await setDevSessionWithRetry(page, "dana@example.test", "Dana");
    await page.goto("/en-US/app/ops");
    await expect(page.getByRole("heading", { name: "Ops access needed" })).toBeVisible();
    await expect(
      page.getByText(
        "Only the site gate owner or household owners and admins can view server health.",
      ),
    ).toBeVisible();
  });

  test("owner creates a household from the dashboard form", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `create-owner+${suffix}@example.test`;
    const householdName = `E2E Loft ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Create Owner E2E");
    await page.goto("/en-US/app");
    await page.getByTestId("create-household-name").fill(householdName);
    await page.getByTestId("create-household-timezone").fill("America/Los_Angeles");
    await page.getByTestId("create-household-currency").fill("CNY");
    await clickHouseholdCreateWithRetry(page);

    await expect(page.getByText("Household created")).toBeVisible();
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();
  });

  test("user updates profile and notification preferences", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const userEmail = `profile+${suffix}@example.test`;
    const updatedName = `Profile User ${suffix}`;

    await setDevSessionWithRetry(page, userEmail, "Profile Initial");
    await page.goto("/en-US/app");
    await expect(page.getByTestId("profile-settings-form")).toBeVisible();

    await page.getByTestId("profile-display-name").fill(updatedName);
    await page.getByTestId("profile-preferred-locale").selectOption("zh-CN");
    await page.getByTestId("profile-emailEnabled").check();
    await page.getByTestId("profile-taskRemindersEnabled").uncheck();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/users/me") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save profile" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText("Profile saved")).toBeVisible();

    const profileResponse = await getApiWithRetry(page, "/api/v1/users/me");
    expect(profileResponse.ok()).toBeTruthy();
    const profilePayload = (await profileResponse.json()) as {
      user: {
        displayName: string;
        preferredLocale: string;
        notificationPreferences: {
          emailEnabled: boolean;
          taskRemindersEnabled: boolean;
        };
      };
    };
    expect(profilePayload.user).toEqual(
      expect.objectContaining({
        displayName: updatedName,
        preferredLocale: "zh-CN",
        notificationPreferences: expect.objectContaining({
          emailEnabled: true,
          taskRemindersEnabled: false,
        }),
      }),
    );

    const sessionResponse = await getApiWithRetry(page, "/api/v1/session");
    expect(sessionResponse.ok()).toBeTruthy();
    const sessionPayload = (await sessionResponse.json()) as {
      user: {
        displayName: string;
        notificationPreferences: { emailEnabled: boolean; taskRemindersEnabled: boolean };
      };
    };
    expect(sessionPayload.user).toEqual(
      expect.objectContaining({
        displayName: updatedName,
        notificationPreferences: expect.objectContaining({
          emailEnabled: true,
          taskRemindersEnabled: false,
        }),
      }),
    );

    await page.goto("/en-US/app");
    await expect(page.getByTestId("profile-display-name")).toHaveValue(updatedName);
    await expect(page.getByTestId("profile-preferred-locale")).toHaveValue("zh-CN");
    await expect(page.getByTestId("profile-emailEnabled")).toBeChecked();
    await expect(page.getByTestId("profile-taskRemindersEnabled")).not.toBeChecked();
  });

  test("expense proposal assignment creates an in-app notification", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `notify-owner+${suffix}@example.test`;
    const debtorEmail = `notify-debtor+${suffix}@example.test`;
    const householdName = `Notify House ${suffix}`;
    const proposalTitle = `Notify Dinner ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Notify Owner E2E");
    const householdResponse = await page.request.post("/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const householdId = householdPayload.household.id;
    const invitePayload = await createInviteWithRetry(
      page,
      householdId,
      {
        email: debtorEmail,
        role: "MEMBER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, debtorEmail, "Notify Debtor E2E");
    const acceptResponse = await page.request.post("/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": debtorEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    const membersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(membersResponse.ok()).toBeTruthy();
    const membersPayload = (await membersResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
    };
    const debtorUserId = membersPayload.members.find(
      (member) => member.email === debtorEmail,
    )?.userId;
    expect(debtorUserId).toBeTruthy();
    if (!debtorUserId) {
      throw new Error("Expected notification debtor user id.");
    }

    const proposalResponse = await page.request.post(
      `/api/v1/households/${householdId}/expenses/proposals`,
      {
        data: {
          title: proposalTitle,
          categoryId: null,
          expenseDate: "2026-07-05",
          originalAmount: "18",
          originalCurrency: "CNY",
          participantUserIds: [debtorUserId],
          splitMethod: "EQUAL",
        },
        headers: {
          "Idempotency-Key": `notify-proposal-${Date.now()}`,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(proposalResponse.ok()).toBeTruthy();
    const proposalPayload = (await proposalResponse.json()) as {
      proposal: { id: string };
    };

    const notificationsResponse = await getApiWithRetry(page, "/api/v1/notifications", {
      headers: {
        "x-roompire-dev-user-email": debtorEmail,
      },
    });
    expect(notificationsResponse.ok()).toBeTruthy();
    const notificationsPayload = (await notificationsResponse.json()) as {
      unreadCount: number;
      notifications: Array<{
        id: string;
        type: string;
        readAt: string | null;
        payload: { proposalId: string; proposalTitle: string; amount: string; currency: string };
      }>;
    };
    expect(notificationsPayload.unreadCount).toBe(1);
    expect(notificationsPayload.notifications[0]).toEqual(
      expect.objectContaining({
        type: "EXPENSE_PROPOSAL_ASSIGNED",
        readAt: null,
        payload: expect.objectContaining({
          proposalId: proposalPayload.proposal.id,
          proposalTitle,
          amount: "9",
          currency: "CNY",
        }),
      }),
    );

    await setDevSessionWithRetry(page, debtorEmail, "Notify Debtor E2E");
    await page.goto("/en-US/app");
    const notificationRow = page.getByTestId("notification-row-EXPENSE_PROPOSAL_ASSIGNED").first();
    await expect(page.getByTestId("notification-center")).toContainText("1 unread");
    await expect(notificationRow).toContainText("Approval needed");
    await expect(notificationRow).toContainText(`${proposalTitle} assigned you 9 CNY.`);

    const readResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/notifications/") &&
        response.request().method() === "PATCH",
    );
    await notificationRow.getByRole("button", { name: "Mark read" }).click();
    const readResponse = await readResponsePromise;
    expect(readResponse.ok()).toBeTruthy();
    await expect(notificationRow).toContainText("Read");
    await expect(page.getByTestId("notification-center")).toContainText("0 unread");
  });

  test("owner updates settings and manages a linked invitee", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `owner+${suffix}@example.test`;
    const inviteeEmail = `member+${suffix}@example.test`;
    const householdName = `E2E House ${suffix}`;
    const updatedName = `E2E House Updated ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Owner E2E");

    await page.goto("/en-US/app");
    await expect(page.getByText("No households yet").first()).toBeVisible();
    await page.getByTestId("create-household-name").fill(householdName);
    await page.getByTestId("create-household-timezone").fill("America/Los_Angeles");
    await page.getByTestId("create-household-currency").fill("CNY");
    await clickHouseholdCreateWithRetry(page);
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();

    await page.getByTestId("settings-household-name").fill(updatedName);
    await page.getByTestId("settings-household-timezone").fill("America/New_York");
    await page.getByTestId("settings-household-currency").fill("USD");
    await page.getByTestId("settings-household-locale").selectOption("zh-CN");
    await page.getByTestId("settings-household-fx-policy").selectOption("ORIGINAL_CURRENCY_DEBT");
    await page.getByTestId("settings-household-approval-policy").selectOption("ALL_PARTICIPANTS");
    await page.getByTestId("settings-household-clearing-policy").selectOption("HOUSEHOLD_NETTING");
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();

    await page.getByLabel("Invite email").fill(inviteeEmail);
    await page.getByLabel("Invite role").selectOption("MEMBER");
    await clickInviteCreateWithRetry(page);
    const inviteHref = await page.getByTestId("invite-link").getAttribute("href");
    expect(inviteHref).toBeTruthy();

    await setDevSessionWithRetry(page, inviteeEmail, "Member E2E");

    await page.goto(inviteHref!);
    await expect(page.getByRole("heading", { name: "Accept household invite" })).toBeVisible();
    await expect(page.getByText(`Join ${updatedName} as ${inviteeEmail}.`)).toBeVisible();
    await page.getByRole("button", { name: "Accept invite" }).click();
    await expect(page.getByText("Invite accepted")).toBeVisible();
    await page.getByRole("link", { name: /Open dashboard/ }).click();
    await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();

    await setDevSessionWithRetry(page, ownerEmail, "Owner E2E");

    await page.goto("/en-US/app");
    const memberRow = page.getByTestId(`member-row-${inviteeEmail}`);
    await expect(memberRow).toBeVisible();
    await memberRow.getByRole("combobox", { name: /Update role/ }).selectOption("VIEWER");
    await clickMemberMutationWithRetry(
      page,
      memberRow.getByRole("button", { name: "Update role" }),
      "PATCH",
    );

    await expect(page.getByText("Role updated")).toBeVisible();
    await clickMemberMutationWithRetry(
      page,
      memberRow.getByRole("button", { name: "Remove member" }),
      "DELETE",
    );
    await expect(page.getByText("Member removed")).toBeVisible();
    await expect(page.getByText(inviteeEmail)).toHaveCount(0);
  });

  test("owner transfers ownership and preserves self-removal guard", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `transfer-owner+${suffix}@example.test`;
    const nextOwnerEmail = `transfer-next+${suffix}@example.test`;
    const householdName = `Transfer House ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Transfer Starter E2E");
    await page.goto("/en-US/app");
    await page.getByTestId("create-household-name").fill(householdName);
    await page.getByTestId("create-household-timezone").fill("America/Los_Angeles");
    await page.getByTestId("create-household-currency").fill("CNY");
    await clickHouseholdCreateWithRetry(page);
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();

    const sessionResponse = await getApiWithRetry(page, "/api/v1/session");
    expect(sessionResponse.ok()).toBeTruthy();
    const sessionPayload = (await sessionResponse.json()) as {
      household: { id: string } | null;
    };
    const householdId = sessionPayload.household?.id;
    expect(householdId).toBeTruthy();
    if (!householdId) {
      throw new Error("Expected transfer household id.");
    }

    await page.getByLabel("Invite email").fill(nextOwnerEmail);
    await page.getByLabel("Invite role").selectOption("MEMBER");
    await clickInviteCreateWithRetry(page);
    const inviteHref = await page.getByTestId("invite-link").getAttribute("href");
    expect(inviteHref).toBeTruthy();

    await setDevSessionWithRetry(page, nextOwnerEmail, "Transfer Successor E2E");
    await page.goto(inviteHref!);
    await page.getByRole("button", { name: "Accept invite" }).click();
    await expect(page.getByText("Invite accepted")).toBeVisible();

    await setDevSessionWithRetry(page, ownerEmail, "Transfer Starter E2E");
    await page.goto("/en-US/app");
    const nextOwnerRow = page.getByTestId(`member-row-${nextOwnerEmail}`);
    await expect(nextOwnerRow).toBeVisible();
    await clickOwnershipTransferWithRetry(
      page,
      nextOwnerRow.getByRole("button", { name: "Transfer ownership" }),
    );
    await expect(nextOwnerRow).toContainText("Owner");

    const membersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(membersResponse.ok()).toBeTruthy();
    const membersPayload = (await membersResponse.json()) as {
      members: Array<{ id: string; email: string; role: string }>;
    };
    const previousOwnerMembership = membersPayload.members.find(
      (member) => member.email === ownerEmail,
    );
    const nextOwnerMembership = membersPayload.members.find(
      (member) => member.email === nextOwnerEmail,
    );
    expect(previousOwnerMembership).toEqual(expect.objectContaining({ role: "ADMIN" }));
    expect(nextOwnerMembership).toEqual(expect.objectContaining({ role: "OWNER" }));
    if (!previousOwnerMembership || !nextOwnerMembership) {
      throw new Error("Expected ownership transfer memberships.");
    }

    const oldOwnerTransferResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members/${previousOwnerMembership.id}/transfer-ownership`,
      {
        data: {},
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(oldOwnerTransferResponse.status()).toBe(403);

    await setDevSessionWithRetry(page, nextOwnerEmail, "Transfer Successor E2E");
    const selfRemoveResponse = await page.request.delete(
      `/api/v1/households/${householdId}/members/${nextOwnerMembership.id}`,
      {
        headers: {
          "x-roompire-dev-user-email": nextOwnerEmail,
        },
      },
    );
    expect(selfRemoveResponse.status()).toBe(400);
    const selfRemovePayload = (await selfRemoveResponse.json()) as {
      error: { code: string };
    };
    expect(selfRemovePayload.error.code).toBe("SELF_MEMBER_MUTATION_FORBIDDEN");

    await page.goto("/en-US/app");
    const previousOwnerRow = page.getByTestId(`member-row-${ownerEmail}`);
    await expect(previousOwnerRow).toContainText("Admin");
    await clickMemberMutationWithRetry(
      page,
      previousOwnerRow.getByRole("button", { name: "Remove member" }),
      "DELETE",
    );
    await expect(page.getByText("Member removed")).toBeVisible();
    await expect(page.getByText(ownerEmail)).toHaveCount(0);
  });

  test("invite flow enforces membership isolation before acceptance", async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `invite-owner+${suffix}@example.test`;
    const inviteeEmail = `mia+${suffix}@example.test`;
    const householdName = `Invite House ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Invite Owner E2E");
    await page.goto("/en-US/app");
    await page.getByTestId("create-household-name").fill(householdName);
    await page.getByTestId("create-household-timezone").fill("America/Los_Angeles");
    await page.getByTestId("create-household-currency").fill("CNY");
    await clickHouseholdCreateWithRetry(page);
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();

    const membersHref = await page
      .getByRole("link", { name: "Open members" })
      .first()
      .getAttribute("href");

    expect(membersHref).toBeTruthy();
    const householdId = membersHref!.split("/").at(-2);
    expect(householdId).toBeTruthy();

    await page.getByLabel("Invite email").fill(inviteeEmail);
    await page.getByLabel("Invite role").selectOption("MEMBER");
    await clickInviteCreateWithRetry(page);
    const inviteToken = await page.getByTestId("invite-token").innerText();

    await setDevSessionWithRetry(page, inviteeEmail, "Mia E2E");

    const forbiddenMembersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members`,
    );
    expect(forbiddenMembersResponse.status()).toBe(404);

    await page.goto("/en-US/app");
    await expect(page.getByText("No households yet").first()).toBeVisible();
    await page.getByLabel("Invite code").fill(inviteToken);
    await page.getByRole("button", { name: "Accept invite" }).click();

    await expect(page.getByText("Invite accepted")).toBeVisible();
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();

    await page.goto(membersHref!);
    await expect(page.getByText("Mia E2E").first()).toBeVisible();
    await expect(page.getByText(inviteeEmail)).toBeVisible();
  });

  test("owner creates a proposal and debtor approval matures one share", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(180_000);
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `expense-owner+${suffix}@example.test`;
    const debtorEmail = `expense-debtor+${suffix}@example.test`;
    const householdName = `Expense House ${suffix}`;
    const proposalTitle = `E2E Grocery ${suffix}`;
    const settlementEvidenceFileName = `settlement-evidence-${suffix}.pdf`;
    const settlementEvidenceBuffer = Buffer.from(
      `%PDF-1.4\nRoompire settlement evidence ${suffix}\n%%EOF`,
    );

    await setDevSessionWithRetry(page, ownerEmail, "Expense Owner E2E");
    const householdResponse = await page.request.post("/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const invitePayload = await createInviteWithRetry(
      page,
      householdPayload.household.id,
      {
        email: debtorEmail,
        role: "MEMBER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, debtorEmail, "Expense Debtor E2E");
    const acceptResponse = await page.request.post("/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": debtorEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    await setDevSessionWithRetry(page, ownerEmail, "Expense Owner E2E");
    await page.goto("/en-US/app");

    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();
    await page.getByTestId("expense-title").fill(proposalTitle);
    await page.getByTestId("expense-merchant").fill("Trader Joe's");
    await page.getByTestId("expense-category").selectOption({ index: 1 });
    await page.getByTestId("expense-date").fill("2026-07-02");
    await page.getByTestId("expense-due-date").fill("2026-07-10");
    await page.getByTestId("expense-amount").fill("90");
    await page.getByTestId("expense-original-currency").fill("USD");
    await page.getByTestId("expense-fx-rate").fill("7.2");
    await page.getByTestId("expense-split-method").selectOption("EXACT");
    await page.getByTestId(`expense-debtor-${debtorEmail}`).check();
    await page.getByTestId(`expense-split-value-${debtorEmail}`).fill("45");
    const exactPreviewRow = page.getByTestId(`expense-split-preview-${debtorEmail}`);
    await expect(exactPreviewRow).toContainText("Expense Debtor E2E");
    await expect(exactPreviewRow).toContainText("USD 45");
    await expect(exactPreviewRow).toContainText("CNY 324");
    await clickExpenseProposalSubmitWithRetry(page);

    await expect(page.getByText("Proposal submitted")).toBeVisible();
    await expect(page.getByText(proposalTitle)).toBeVisible();
    await expect(page.getByText("No approved obligations yet")).toBeVisible();
    await expect(page.getByTestId("dashboard-stat-matured-obligations")).toContainText("0");

    await Promise.all([
      page.waitForURL("**/expenses/proposals/**"),
      page.getByRole("link", { name: `Open detail: ${proposalTitle}` }).click(),
    ]);
    await expect(page.getByRole("heading", { name: proposalTitle })).toBeVisible();
    await expect(page.getByText("Expense Debtor E2E")).toBeVisible();
    await expect(page.getByText("Exact amounts")).toBeVisible();
    await expect(page.getByText("USD 45 · CNY 324")).toBeVisible();
    await expect(
      page.getByText("No formal ledger obligation has been created for this proposal."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve share" })).toHaveCount(0);
    const ownerComment = `Owner note ${suffix}`;
    await page.getByTestId("proposal-comment-body").fill(ownerComment);
    await page.getByTestId("proposal-comment-submit").click();
    await expect(page.getByText("Comment added")).toBeVisible();
    await expect(page.getByTestId("proposal-comments")).toContainText(ownerComment);
    await expect(page.getByTestId("proposal-timeline")).toContainText("submitted proposal");
    await expect(page.getByTestId("proposal-timeline")).toContainText("commented");

    const detailUrl = page.url();
    const detailIds = parseProposalDetailUrl(detailUrl);
    const proposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/proposals/${detailIds.proposalId}`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(proposalResponse.ok()).toBeTruthy();
    const proposalPayload = (await proposalResponse.json()) as {
      proposal: {
        splitMethod: string;
        shares: Array<{
          id: string;
          debtorUserId: string;
          creditorUserId: string;
          shareOriginalAmount: string;
          shareSettlementAmount: string;
          percentage: string | null;
          shareUnits: string | null;
        }>;
        comments: Array<{
          id: string;
          authorUserId: string;
          body: string;
        }>;
      };
    };
    expect(proposalPayload.proposal.splitMethod).toBe("EXACT");
    expect(proposalPayload.proposal.comments).toEqual([
      expect.objectContaining({
        body: ownerComment,
      }),
    ]);
    const approvedShare = proposalPayload.proposal.shares[0];
    const shareId = approvedShare?.id;
    expect(shareId).toBeTruthy();
    expect(approvedShare).toMatchObject({
      shareOriginalAmount: "45",
      shareSettlementAmount: "324",
      percentage: null,
      shareUnits: null,
    });

    const ownerApproveResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${shareId}/approve`,
      {
        data: {},
        headers: {
          "Idempotency-Key": `owner-approve-${Date.now()}`,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(ownerApproveResponse.status()).toBe(403);

    await setDevSessionWithRetry(page, debtorEmail, "Expense Debtor E2E");
    await page.goto(detailUrl);
    await expect(page.getByRole("button", { name: "Approve share" })).toBeVisible();
    await clickShareApproveWithRetry(page, shareId!);
    await page.reload();

    await expect(page.getByText("In ledger").first()).toBeVisible();
    await expect(
      page.getByText("Approved shares have created formal ledger obligations."),
    ).toBeVisible();

    const repeatApproveResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${shareId}/approve`,
      {
        data: {},
        headers: {
          "Idempotency-Key": `repeat-approve-${Date.now()}`,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(repeatApproveResponse.ok()).toBeTruthy();

    await page.goto("/en-US/app");
    await expect(page.getByTestId("dashboard-stat-matured-obligations")).toContainText("1");
    await expect(page.getByText("Expense Debtor E2E owes Expense Owner E2E")).toBeVisible();
    await expect(page.getByText("CNY 324")).toBeVisible();

    const balancesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(balancesResponse.ok()).toBeTruthy();
    const balancesPayload = (await balancesResponse.json()) as {
      balances: Array<{
        debtorUserId: string;
        creditorUserId: string;
        amount: string;
        currency: string;
        obligationCount: number;
      }>;
    };
    expect(balancesPayload.balances).toEqual([
      {
        debtorUserId: approvedShare!.debtorUserId,
        creditorUserId: approvedShare!.creditorUserId,
        amount: "324",
        currency: "CNY",
        obligationCount: 1,
      },
    ]);

    const obligationsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(obligationsResponse.ok()).toBeTruthy();
    const obligationsPayload = (await obligationsResponse.json()) as {
      obligations: Array<{
        id: string;
        sourceShareId: string;
        remainingAmount: string;
        settlementCurrency: string;
        status: string;
      }>;
    };
    expect(obligationsPayload.obligations).toHaveLength(1);
    expect(obligationsPayload.obligations[0]).toMatchObject({
      sourceShareId: shareId,
      remainingAmount: "324",
      settlementCurrency: "CNY",
      status: "OPEN",
    });
    const primaryObligationId = obligationsPayload.obligations[0]?.id;
    expect(primaryObligationId).toBeTruthy();

    const repaymentEventsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/calendar/events`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(repaymentEventsResponse.ok()).toBeTruthy();
    const repaymentEventsPayload = (await repaymentEventsResponse.json()) as {
      events: Array<{
        title: string;
        type: string;
        startAt: string;
        allDay: boolean;
        links: Array<{ linkedType: string; linkedId: string }>;
      }>;
    };
    const repaymentEvent = repaymentEventsPayload.events.find(
      (event) => event.title === `Repayment due: ${proposalTitle}`,
    );
    expect(repaymentEvent).toMatchObject({
      title: `Repayment due: ${proposalTitle}`,
      type: "REPAYMENT_DUE",
      allDay: true,
    });
    expect(repaymentEvent!.startAt.slice(0, 10)).toBe("2026-07-10");
    expect(repaymentEvent!.links).toContainEqual(
      expect.objectContaining({
        linkedType: "debt_obligation",
        linkedId: primaryObligationId,
      }),
    );

    const transactionsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/ledger/transactions`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(transactionsResponse.ok()).toBeTruthy();
    const transactionsPayload = (await transactionsResponse.json()) as {
      transactions: Array<{
        type: string;
        obligations: Array<{ sourceShareId: string }>;
        settlements: unknown[];
      }>;
    };
    expect(transactionsPayload.transactions).toHaveLength(1);
    expect(transactionsPayload.transactions[0]).toMatchObject({
      type: "DEBT_CREATED",
      obligations: [{ sourceShareId: shareId }],
      settlements: [],
    });

    await page.goto("/en-US/app/ledger");
    await expect(page.getByRole("heading", { name: "Formal ledger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Who owes whom" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open obligations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ledger transactions" })).toBeVisible();
    const balanceRow = page.getByTestId(
      `ledger-balance-${approvedShare!.debtorUserId}-${approvedShare!.creditorUserId}`,
    );
    await expect(balanceRow).toContainText("Expense Debtor E2E owes Expense Owner E2E");
    await expect(balanceRow).toContainText("CNY 324");
    const suggestionRow = page.getByTestId(
      `settlement-suggestion-${approvedShare!.debtorUserId}-${approvedShare!.creditorUserId}-CNY`,
    );
    await expect(suggestionRow).toContainText("Expense Debtor E2E pays Expense Owner E2E");
    await expect(suggestionRow).toContainText("CNY 324");

    const suggestionsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/settlement-suggestions`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(suggestionsResponse.ok()).toBeTruthy();
    const suggestionsPayload = (await suggestionsResponse.json()) as {
      suggestions: Array<{
        debtorUserId: string;
        creditorUserId: string;
        amount: string;
        currency: string;
        debtorOpenObligationCount: number;
        creditorOpenObligationCount: number;
        directOpenObligationCount: number;
        directRemainingAmount: string;
        actionability: "DIRECTLY_SETTLEABLE" | "CLEARING_SETTLEABLE" | "GUIDANCE_ONLY";
      }>;
    };
    expect(suggestionsPayload.suggestions).toEqual([
      {
        debtorUserId: approvedShare!.debtorUserId,
        creditorUserId: approvedShare!.creditorUserId,
        amount: "324",
        currency: "CNY",
        debtorOpenObligationCount: 1,
        creditorOpenObligationCount: 1,
        directOpenObligationCount: 1,
        directRemainingAmount: "324",
        actionability: "DIRECTLY_SETTLEABLE",
      },
    ]);

    await page.getByTestId(`settlement-amount-${primaryObligationId}`).fill("324");
    await page.getByTestId(`settlement-date-${primaryObligationId}`).fill("2026-07-04");
    await page.getByTestId(`settlement-evidence-${primaryObligationId}`).setInputFiles({
      name: settlementEvidenceFileName,
      mimeType: "application/pdf",
      buffer: settlementEvidenceBuffer,
    });
    await clickSettlementSubmitWithRetry(page, primaryObligationId!);

    const submittedSettlementsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/settlements`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(submittedSettlementsResponse.ok()).toBeTruthy();
    const submittedSettlementsPayload = (await submittedSettlementsResponse.json()) as {
      settlements: Array<{
        id: string;
        amount: string;
        status: string;
        allocations: unknown[];
        files: Array<{
          id: string;
          originalFilename: string;
          mimeType: string;
          sizeBytes: number;
          sha256: string | null;
          downloadUrl: string;
        }>;
      }>;
    };
    expect(submittedSettlementsPayload.settlements).toHaveLength(1);
    expect(submittedSettlementsPayload.settlements[0]).toMatchObject({
      amount: "324",
      status: "SUBMITTED",
      allocations: [],
    });
    expect(submittedSettlementsPayload.settlements[0]?.files).toHaveLength(1);
    expect(submittedSettlementsPayload.settlements[0]?.files[0]).toMatchObject({
      originalFilename: settlementEvidenceFileName,
      mimeType: "application/pdf",
      sizeBytes: settlementEvidenceBuffer.length,
    });
    expect(submittedSettlementsPayload.settlements[0]?.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    const submittedSettlementId = submittedSettlementsPayload.settlements[0]?.id;
    const submittedSettlementFile = submittedSettlementsPayload.settlements[0]?.files[0];
    expect(submittedSettlementId).toBeTruthy();
    expect(submittedSettlementFile?.downloadUrl).toBeTruthy();

    const evidenceDownloadResponse = await getApiWithRetry(
      page,
      submittedSettlementFile!.downloadUrl,
    );
    expect(evidenceDownloadResponse.ok()).toBeTruthy();
    expect(
      Buffer.from(await evidenceDownloadResponse.body()).equals(settlementEvidenceBuffer),
    ).toBeTruthy();

    await setDevSessionWithRetry(page, ownerEmail, "Expense Owner E2E");
    await page.goto("/en-US/app/ledger");
    const pendingSettlementRow = page.getByTestId(`pending-settlement-${submittedSettlementId}`);
    await expect(pendingSettlementRow).toContainText("CNY 324");
    await expect(pendingSettlementRow).toContainText(settlementEvidenceFileName);
    await expect(
      pendingSettlementRow.getByRole("link", { name: "Download evidence" }),
    ).toBeVisible();
    await clickSettlementConfirmWithRetry(page, submittedSettlementId!);

    const settledBalancesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(settledBalancesResponse.ok()).toBeTruthy();
    const settledBalancesPayload = (await settledBalancesResponse.json()) as {
      balances: unknown[];
    };
    expect(settledBalancesPayload.balances).toEqual([]);
    const settledSuggestionsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/settlement-suggestions`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(settledSuggestionsResponse.ok()).toBeTruthy();
    const settledSuggestionsPayload = (await settledSuggestionsResponse.json()) as {
      suggestions: unknown[];
    };
    expect(settledSuggestionsPayload.suggestions).toEqual([]);

    const postSettlementStatsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/stats/summary`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(postSettlementStatsResponse.ok()).toBeTruthy();
    const postSettlementStatsPayload = (await postSettlementStatsResponse.json()) as {
      summary: { receiptFileCount: number };
    };
    expect(postSettlementStatsPayload.summary.receiptFileCount).toBeGreaterThanOrEqual(1);

    const settledObligationsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(settledObligationsResponse.ok()).toBeTruthy();
    const settledObligationsPayload = (await settledObligationsResponse.json()) as {
      obligations: Array<{ id: string; remainingAmount: string; status: string }>;
    };
    expect(
      settledObligationsPayload.obligations.find(
        (obligation) => obligation.id === primaryObligationId,
      ),
    ).toMatchObject({
      remainingAmount: "0",
      status: "SETTLED",
    });

    const idempotentProposalBody = {
      title: `E2E Idempotent ${suffix}`,
      expenseDate: "2026-07-04",
      originalAmount: "20",
      originalCurrency: "CNY",
      participantUserIds: [approvedShare!.debtorUserId],
    };
    const proposalIdempotencyKey = `proposal-idempotency-${Date.now()}`;
    const idempotentProposalResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/proposals`,
      {
        data: idempotentProposalBody,
        headers: {
          "Idempotency-Key": proposalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(idempotentProposalResponse.status()).toBe(201);
    const idempotentProposalPayload = (await idempotentProposalResponse.json()) as {
      proposal: {
        id: string;
        shares: Array<{ id: string }>;
      };
    };
    const idempotentShareId = idempotentProposalPayload.proposal.shares[0]?.id;
    expect(idempotentShareId).toBeTruthy();

    const idempotentProposalReplayResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/proposals`,
      {
        data: idempotentProposalBody,
        headers: {
          "Idempotency-Key": proposalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(idempotentProposalReplayResponse.status()).toBe(201);
    const idempotentProposalReplayPayload =
      (await idempotentProposalReplayResponse.json()) as typeof idempotentProposalPayload;
    expect(idempotentProposalReplayPayload.proposal.id).toBe(idempotentProposalPayload.proposal.id);

    const idempotentProposalConflictResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/proposals`,
      {
        data: {
          ...idempotentProposalBody,
          title: `E2E Idempotent Conflict ${suffix}`,
        },
        headers: {
          "Idempotency-Key": proposalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(idempotentProposalConflictResponse.status()).toBe(409);

    const commentIdempotencyKey = `comment-idempotency-${Date.now()}`;
    const commentBody = { body: `API comment ${suffix}` };
    const idempotentCommentResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/proposals/${detailIds.proposalId}/comments`,
      {
        data: commentBody,
        headers: {
          "Idempotency-Key": commentIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(idempotentCommentResponse.status()).toBe(201);
    const idempotentCommentPayload = (await idempotentCommentResponse.json()) as {
      proposal: { comments: Array<{ id: string; body: string }> };
    };
    const idempotentComment = idempotentCommentPayload.proposal.comments.find(
      (comment) => comment.body === commentBody.body,
    );
    expect(idempotentComment).toBeTruthy();

    const idempotentCommentReplayResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/proposals/${detailIds.proposalId}/comments`,
      {
        data: commentBody,
        headers: {
          "Idempotency-Key": commentIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(idempotentCommentReplayResponse.status()).toBe(201);
    const idempotentCommentReplayPayload =
      (await idempotentCommentReplayResponse.json()) as typeof idempotentCommentPayload;
    const replayedComment = idempotentCommentReplayPayload.proposal.comments.find(
      (comment) => comment.body === commentBody.body,
    );
    expect(replayedComment?.id).toBe(idempotentComment!.id);

    const idempotentCommentConflictResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/proposals/${detailIds.proposalId}/comments`,
      {
        data: { body: `Changed API comment ${suffix}` },
        headers: {
          "Idempotency-Key": commentIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(idempotentCommentConflictResponse.status()).toBe(409);

    const percentageProposalResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/proposals`,
      {
        data: {
          title: `E2E Percentage ${suffix}`,
          expenseDate: "2026-07-04",
          originalAmount: "100",
          originalCurrency: "CNY",
          splitMethod: "PERCENTAGE",
          participantShares: [{ userId: approvedShare!.debtorUserId, percentage: "25" }],
        },
        headers: {
          "Idempotency-Key": `percentage-proposal-${Date.now()}`,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(percentageProposalResponse.status()).toBe(201);
    const percentageProposalPayload = (await percentageProposalResponse.json()) as {
      proposal: {
        splitMethod: string;
        shares: Array<{
          shareOriginalAmount: string;
          shareSettlementAmount: string;
          percentage: string | null;
          shareUnits: string | null;
        }>;
      };
    };
    expect(percentageProposalPayload.proposal.splitMethod).toBe("PERCENTAGE");
    expect(percentageProposalPayload.proposal.shares[0]).toMatchObject({
      shareOriginalAmount: "25",
      shareSettlementAmount: "25",
      percentage: "25",
      shareUnits: null,
    });

    const sharesProposalResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/proposals`,
      {
        data: {
          title: `E2E Shares ${suffix}`,
          expenseDate: "2026-07-04",
          originalAmount: "120",
          originalCurrency: "CNY",
          splitMethod: "SHARES",
          participantShares: [{ userId: approvedShare!.debtorUserId, shareUnits: "2" }],
        },
        headers: {
          "Idempotency-Key": `shares-proposal-${Date.now()}`,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(sharesProposalResponse.status()).toBe(201);
    const sharesProposalPayload = (await sharesProposalResponse.json()) as {
      proposal: {
        splitMethod: string;
        shares: Array<{
          shareOriginalAmount: string;
          shareSettlementAmount: string;
          percentage: string | null;
          shareUnits: string | null;
        }>;
      };
    };
    expect(sharesProposalPayload.proposal.splitMethod).toBe("SHARES");
    expect(sharesProposalPayload.proposal.shares[0]).toMatchObject({
      shareOriginalAmount: "80",
      shareSettlementAmount: "80",
      percentage: null,
      shareUnits: "2",
    });

    const cachedFxProposalResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/proposals`,
      {
        data: {
          title: `E2E Cached FX ${suffix}`,
          expenseDate: "2026-07-04",
          originalAmount: "20",
          originalCurrency: "USD",
          participantUserIds: [approvedShare!.debtorUserId],
        },
        headers: {
          "Idempotency-Key": `cached-fx-proposal-${Date.now()}`,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(cachedFxProposalResponse.status()).toBe(201);
    const cachedFxProposalPayload = (await cachedFxProposalResponse.json()) as {
      proposal: {
        originalCurrency: string;
        settlementCurrency: string;
        settlementAmount: string;
        fxRate: string;
        fxRateDate: string;
        fxProvider: string;
        shares: Array<{ shareOriginalAmount: string; shareSettlementAmount: string }>;
      };
    };
    expect(cachedFxProposalPayload.proposal).toMatchObject({
      originalCurrency: "USD",
      settlementCurrency: "CNY",
      settlementAmount: "135.628",
      fxRate: "6.7814",
      fxRateDate: "2026-07-03",
      fxProvider: "seed-static",
    });
    expect(cachedFxProposalPayload.proposal.shares[0]).toMatchObject({
      shareOriginalAmount: "10",
      shareSettlementAmount: "67.814",
    });

    const approvalIdempotencyKey = `approval-idempotency-${Date.now()}`;
    const idempotentApprovalBody = { comment: "Idempotent approval" };
    const idempotentApprovalResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${idempotentShareId}/approve`,
      {
        data: idempotentApprovalBody,
        headers: {
          "Idempotency-Key": approvalIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(idempotentApprovalResponse.ok()).toBeTruthy();
    const idempotentApprovalPayload = (await idempotentApprovalResponse.json()) as {
      proposal: { id: string };
    };

    const idempotentApprovalReplayResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${idempotentShareId}/approve`,
      {
        data: idempotentApprovalBody,
        headers: {
          "Idempotency-Key": approvalIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(idempotentApprovalReplayResponse.ok()).toBeTruthy();
    const idempotentApprovalReplayPayload =
      (await idempotentApprovalReplayResponse.json()) as typeof idempotentApprovalPayload;
    expect(idempotentApprovalReplayPayload.proposal.id).toBe(idempotentApprovalPayload.proposal.id);

    const idempotentApprovalConflictResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${idempotentShareId}/approve`,
      {
        data: { comment: "Changed approval comment" },
        headers: {
          "Idempotency-Key": approvalIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(idempotentApprovalConflictResponse.status()).toBe(409);

    const obligationsAfterIdempotentApprovalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(obligationsAfterIdempotentApprovalResponse.ok()).toBeTruthy();
    const obligationsAfterIdempotentApproval =
      (await obligationsAfterIdempotentApprovalResponse.json()) as {
        obligations: Array<{
          id: string;
          sourceShareId: string;
          remainingAmount: string;
          status: string;
        }>;
      };
    expect(
      obligationsAfterIdempotentApproval.obligations.filter(
        (obligation) => obligation.sourceShareId === idempotentShareId,
      ),
    ).toHaveLength(1);
    const idempotentObligation = obligationsAfterIdempotentApproval.obligations.find(
      (obligation) => obligation.sourceShareId === idempotentShareId,
    );
    expect(idempotentObligation).toMatchObject({
      remainingAmount: "10",
      status: "OPEN",
    });

    const settlementIdempotencyKey = `settlement-idempotency-${Date.now()}`;
    const idempotentSettlementBody = {
      debtObligationId: idempotentObligation!.id,
      amount: idempotentObligation!.remainingAmount,
      settlementDate: "2026-07-04",
      method: "manual",
      note: "API replay",
    };
    const idempotentSettlementResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/settlements`,
      {
        data: idempotentSettlementBody,
        headers: {
          "Idempotency-Key": settlementIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(idempotentSettlementResponse.status()).toBe(201);
    const idempotentSettlementPayload = (await idempotentSettlementResponse.json()) as {
      settlement: { id: string };
    };

    const idempotentSettlementReplayResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/settlements`,
      {
        data: idempotentSettlementBody,
        headers: {
          "Idempotency-Key": settlementIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(idempotentSettlementReplayResponse.status()).toBe(201);
    const idempotentSettlementReplayPayload =
      (await idempotentSettlementReplayResponse.json()) as typeof idempotentSettlementPayload;
    expect(idempotentSettlementReplayPayload.settlement.id).toBe(
      idempotentSettlementPayload.settlement.id,
    );

    const idempotentSettlementConflictResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/settlements`,
      {
        data: {
          ...idempotentSettlementBody,
          note: "Changed settlement note",
        },
        headers: {
          "Idempotency-Key": settlementIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(idempotentSettlementConflictResponse.status()).toBe(409);

    const confirmSettlementIdempotencyKey = `settlement-confirm-idempotency-${Date.now()}`;
    const confirmSettlementResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/settlements/${idempotentSettlementPayload.settlement.id}/confirm`,
      {
        data: {},
        headers: {
          "Idempotency-Key": confirmSettlementIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(confirmSettlementResponse.ok()).toBeTruthy();
    const confirmSettlementPayload = (await confirmSettlementResponse.json()) as {
      settlement: { id: string; status: string; allocations: Array<{ amountApplied: string }> };
    };
    expect(confirmSettlementPayload.settlement).toMatchObject({
      id: idempotentSettlementPayload.settlement.id,
      status: "CONFIRMED",
      allocations: [{ amountApplied: "10" }],
    });

    const confirmSettlementReplayResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/settlements/${idempotentSettlementPayload.settlement.id}/confirm`,
      {
        data: {},
        headers: {
          "Idempotency-Key": confirmSettlementIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(confirmSettlementReplayResponse.ok()).toBeTruthy();
    const confirmSettlementReplayPayload =
      (await confirmSettlementReplayResponse.json()) as typeof confirmSettlementPayload;
    expect(confirmSettlementReplayPayload.settlement.id).toBe(
      confirmSettlementPayload.settlement.id,
    );

    const confirmSettlementConflictResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/settlements/${idempotentSettlementPayload.settlement.id}/confirm`,
      {
        data: { changed: true },
        headers: {
          "Idempotency-Key": confirmSettlementIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(confirmSettlementConflictResponse.status()).toBe(409);

    await page.goto("/en-US/app/ledger");
    await page.getByTestId("ledger-adjustment-debtor").selectOption(approvedShare!.debtorUserId);
    await page
      .getByTestId("ledger-adjustment-creditor")
      .selectOption(approvedShare!.creditorUserId);
    await page.getByTestId("ledger-adjustment-amount").fill("15");
    await page.getByTestId("ledger-adjustment-currency").fill("CNY");
    await page.getByTestId("ledger-adjustment-occurred").fill("2026-07-04");
    await page.getByTestId("ledger-adjustment-reason").fill("Manual E2E correction");
    await clickLedgerAdjustmentSubmitWithRetry(page);

    const adjustmentBalancesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(adjustmentBalancesResponse.ok()).toBeTruthy();
    const adjustmentBalancesPayload = (await adjustmentBalancesResponse.json()) as {
      balances: Array<{ amount: string; currency: string }>;
    };
    expect(adjustmentBalancesPayload.balances).toEqual([
      {
        debtorUserId: approvedShare!.debtorUserId,
        creditorUserId: approvedShare!.creditorUserId,
        amount: "15",
        currency: "CNY",
        obligationCount: 1,
      },
    ]);
    const adjustmentSuggestionsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/settlement-suggestions`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(adjustmentSuggestionsResponse.ok()).toBeTruthy();
    const adjustmentSuggestionsPayload = (await adjustmentSuggestionsResponse.json()) as {
      suggestions: Array<{
        amount: string;
        currency: string;
        directOpenObligationCount: number;
        directRemainingAmount: string;
        actionability: "DIRECTLY_SETTLEABLE" | "CLEARING_SETTLEABLE" | "GUIDANCE_ONLY";
      }>;
    };
    expect(adjustmentSuggestionsPayload.suggestions).toEqual([
      {
        debtorUserId: approvedShare!.debtorUserId,
        creditorUserId: approvedShare!.creditorUserId,
        amount: "15",
        currency: "CNY",
        debtorOpenObligationCount: 1,
        creditorOpenObligationCount: 1,
        directOpenObligationCount: 1,
        directRemainingAmount: "15",
        actionability: "DIRECTLY_SETTLEABLE",
      },
    ]);

    const adjustmentObligationsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(adjustmentObligationsResponse.ok()).toBeTruthy();
    const adjustmentObligationsPayload = (await adjustmentObligationsResponse.json()) as {
      obligations: Array<{
        id: string;
        sourceShareId: string | null;
        remainingAmount: string;
        status: string;
      }>;
    };
    const uiAdjustmentObligation = adjustmentObligationsPayload.obligations.find(
      (obligation) =>
        obligation.sourceShareId === null &&
        obligation.remainingAmount === "15" &&
        obligation.status === "OPEN",
    );
    expect(uiAdjustmentObligation).toBeTruthy();

    await page
      .getByTestId(`ledger-reversal-reason-${uiAdjustmentObligation!.id}`)
      .fill("Reverse manual E2E correction");
    await clickLedgerReversalSubmitWithRetry(page, uiAdjustmentObligation!.id);

    const reversedBalancesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(reversedBalancesResponse.ok()).toBeTruthy();
    const reversedBalancesPayload = (await reversedBalancesResponse.json()) as {
      balances: unknown[];
    };
    expect(reversedBalancesPayload.balances).toEqual([]);

    const adjustmentIdempotencyKey = `adjustment-idempotency-${Date.now()}`;
    const adjustmentBody = {
      debtorUserId: approvedShare!.debtorUserId,
      creditorUserId: approvedShare!.creditorUserId,
      amount: "5",
      currency: "CNY",
      occurredAt: "2026-07-04",
      reason: "API adjustment replay",
    };
    const adjustmentResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/ledger/adjustments`,
      {
        data: adjustmentBody,
        headers: {
          "Idempotency-Key": adjustmentIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(adjustmentResponse.status()).toBe(201);
    const adjustmentPayload = (await adjustmentResponse.json()) as {
      transaction: { id: string; obligations: Array<{ id: string }> };
    };
    const apiAdjustmentObligationId = adjustmentPayload.transaction.obligations[0]?.id;
    expect(apiAdjustmentObligationId).toBeTruthy();

    const adjustmentReplayResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/ledger/adjustments`,
      {
        data: adjustmentBody,
        headers: {
          "Idempotency-Key": adjustmentIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(adjustmentReplayResponse.status()).toBe(201);
    const adjustmentReplayPayload =
      (await adjustmentReplayResponse.json()) as typeof adjustmentPayload;
    expect(adjustmentReplayPayload.transaction.id).toBe(adjustmentPayload.transaction.id);

    const adjustmentConflictResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/ledger/adjustments`,
      {
        data: {
          ...adjustmentBody,
          reason: "Changed adjustment reason",
        },
        headers: {
          "Idempotency-Key": adjustmentIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(adjustmentConflictResponse.status()).toBe(409);

    const reversalIdempotencyKey = `reversal-idempotency-${Date.now()}`;
    const reversalBody = {
      reason: "API reversal replay",
      occurredAt: "2026-07-04",
    };
    const reversalResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/ledger/obligations/${apiAdjustmentObligationId}/reverse`,
      {
        data: reversalBody,
        headers: {
          "Idempotency-Key": reversalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(reversalResponse.ok()).toBeTruthy();
    const reversalPayload = (await reversalResponse.json()) as {
      transaction: { id: string; type: string; reversesTransactionId: string | null };
    };
    expect(reversalPayload.transaction.type).toBe("REVERSAL");

    const reversalReplayResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/ledger/obligations/${apiAdjustmentObligationId}/reverse`,
      {
        data: reversalBody,
        headers: {
          "Idempotency-Key": reversalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(reversalReplayResponse.ok()).toBeTruthy();
    const reversalReplayPayload = (await reversalReplayResponse.json()) as typeof reversalPayload;
    expect(reversalReplayPayload.transaction.id).toBe(reversalPayload.transaction.id);

    const reversalConflictResponse = await page.request.post(
      `/api/v1/households/${detailIds.householdId}/ledger/obligations/${apiAdjustmentObligationId}/reverse`,
      {
        data: {
          ...reversalBody,
          reason: "Changed reversal reason",
        },
        headers: {
          "Idempotency-Key": reversalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(reversalConflictResponse.status()).toBe(409);

    const reversedAdjustmentResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(reversedAdjustmentResponse.ok()).toBeTruthy();
    const reversedAdjustmentPayload = (await reversedAdjustmentResponse.json()) as {
      obligations: Array<{ id: string; status: string; remainingAmount: string }>;
    };
    expect(
      reversedAdjustmentPayload.obligations.find(
        (obligation) => obligation.id === apiAdjustmentObligationId,
      ),
    ).toMatchObject({
      status: "REVERSED",
      remainingAmount: "0",
    });
  });

  test("owner attaches a receipt to a proposal and downloads it", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `receipt-owner+${suffix}@example.test`;
    const debtorEmail = `receipt-debtor+${suffix}@example.test`;
    const householdName = `Receipt House ${suffix}`;
    const proposalTitle = `E2E Receipt ${suffix}`;
    const receiptFileName = `receipt-${suffix}.pdf`;
    const receiptBuffer = Buffer.from(`%PDF-1.4\nRoompire receipt ${suffix}\n%%EOF`);

    await setDevSessionWithRetry(page, ownerEmail, "Receipt Owner E2E");
    const householdResponse = await page.request.post("/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const invitePayload = await createInviteWithRetry(
      page,
      householdPayload.household.id,
      {
        email: debtorEmail,
        role: "MEMBER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, debtorEmail, "Receipt Debtor E2E");
    const acceptResponse = await page.request.post("/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": debtorEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    await setDevSessionWithRetry(page, ownerEmail, "Receipt Owner E2E");
    await page.goto("/en-US/app");
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();
    await page.getByTestId("expense-title").fill(proposalTitle);
    await page.getByTestId("expense-date").fill("2026-07-04");
    await page.getByTestId("expense-amount").fill("60");
    await page.getByTestId("expense-original-currency").fill("CNY");
    await page.getByTestId(`expense-debtor-${debtorEmail}`).check();
    await page.getByTestId("expense-receipt-file").setInputFiles({
      name: receiptFileName,
      mimeType: "application/pdf",
      buffer: receiptBuffer,
    });
    await clickExpenseProposalSubmitWithRetry(page);
    await expect(page.getByText("Proposal submitted")).toBeVisible();

    await Promise.all([
      page.waitForURL("**/expenses/proposals/**"),
      page.getByRole("link", { name: `Open detail: ${proposalTitle}` }).click(),
    ]);
    await expect(page.getByTestId("proposal-files")).toContainText(receiptFileName);
    await expect(page.getByRole("link", { name: "Download receipt" })).toBeVisible();

    const detailIds = parseProposalDetailUrl(page.url());
    const proposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/proposals/${detailIds.proposalId}`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(proposalResponse.ok()).toBeTruthy();
    const proposalPayload = (await proposalResponse.json()) as {
      proposal: {
        files: Array<{
          id: string;
          originalFilename: string;
          mimeType: string;
          sizeBytes: number;
          sha256: string | null;
        }>;
      };
    };
    expect(proposalPayload.proposal.files).toHaveLength(1);
    expect(proposalPayload.proposal.files[0]).toMatchObject({
      originalFilename: receiptFileName,
      mimeType: "application/pdf",
      sizeBytes: receiptBuffer.length,
    });
    expect(proposalPayload.proposal.files[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);

    const receiptFileId = proposalPayload.proposal.files[0]!.id;
    const downloadUrlResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/files/${receiptFileId}/download-url`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(downloadUrlResponse.ok()).toBeTruthy();
    const downloadUrlPayload = (await downloadUrlResponse.json()) as {
      downloadUrl: string;
      expiresAt: string;
    };
    expect(new Date(downloadUrlPayload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const downloadResponse = await getApiWithRetry(page, downloadUrlPayload.downloadUrl);
    expect(downloadResponse.ok()).toBeTruthy();
    expect(Buffer.from(await downloadResponse.body()).equals(receiptBuffer)).toBeTruthy();
  });

  test("creator revises a disputed proposal after requested changes", async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `revision-owner+${suffix}@example.test`;
    const debtorEmail = `revision-debtor+${suffix}@example.test`;
    const householdName = `Revision House ${suffix}`;
    const proposalTitle = `E2E Shared supplies ${suffix}`;
    const revisedTitle = `E2E Revised supplies ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Revision Owner E2E");
    const householdResponse = await postApiWithRetry(page, "/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const householdId = householdPayload.household.id;
    const invitePayload = await createInviteWithRetry(
      page,
      householdId,
      {
        email: debtorEmail,
        role: "MEMBER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, debtorEmail, "Revision Debtor E2E");
    const acceptResponse = await postApiWithRetry(page, "/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": debtorEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    const membersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(membersResponse.ok()).toBeTruthy();
    const membersPayload = (await membersResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
    };
    const debtorUserId = membersPayload.members.find(
      (member) => member.email === debtorEmail,
    )?.userId;
    expect(debtorUserId).toBeTruthy();
    if (!debtorUserId) {
      throw new Error("Expected debtor user id in revision members payload");
    }

    const createProposalResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/expenses/proposals`,
      {
        data: {
          title: proposalTitle,
          merchant: "Target",
          expenseDate: "2026-07-04",
          originalAmount: "90",
          originalCurrency: "CNY",
          participantUserIds: [debtorUserId],
          splitMethod: "EQUAL",
        },
        headers: {
          "Idempotency-Key": `revision-create-${suffix}`,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(createProposalResponse.ok()).toBeTruthy();
    const createProposalPayload = (await createProposalResponse.json()) as {
      proposal: {
        id: string;
        revisionNumber: number;
        supersedesProposalId: string | null;
        shares: Array<{ id: string }>;
      };
    };
    expect(createProposalPayload.proposal.revisionNumber).toBe(1);
    expect(createProposalPayload.proposal.supersedesProposalId).toBeNull();
    const proposalId = createProposalPayload.proposal.id;
    const shareId = createProposalPayload.proposal.shares[0]?.id;
    expect(shareId).toBeTruthy();

    await setDevSessionWithRetry(page, debtorEmail, "Revision Debtor E2E");
    const detailUrl = `/en-US/app/households/${householdId}/expenses/proposals/${proposalId}`;
    await page.goto(detailUrl);
    await expect(page.getByRole("heading", { name: proposalTitle })).toBeVisible();
    await clickShareRequestChangesWithRetry(page, shareId!, "Please remove the storage bins");
    await expect(page.getByText("Disputed").first()).toBeVisible();
    await expect(page.getByTestId("proposal-timeline")).toContainText("requested changes");
    await expect(
      page.getByText("No formal ledger obligation has been created for this proposal."),
    ).toBeVisible();

    await setDevSessionWithRetry(page, ownerEmail, "Revision Owner E2E");
    await page.goto(detailUrl);
    await expect(page.getByTestId("proposal-revision-form")).toBeVisible();
    await page.getByTestId("proposal-revision-reason").fill("Removed disputed item");
    await page.getByTestId("proposal-revision-title").fill(revisedTitle);
    await page.getByTestId("proposal-revision-amount").fill("72");
    const revisionResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/expenses/proposals/${proposalId}/revisions`) &&
        response.request().method() === "POST",
    );
    await page.getByTestId("proposal-revision-submit").click();
    const revisionResponse = await revisionResponsePromise;
    expect(revisionResponse.ok()).toBeTruthy();
    const revisionPayload = (await revisionResponse.json()) as {
      proposal: {
        id: string;
        revisionNumber: number;
        supersedesProposalId: string | null;
        title: string;
        status: string;
        originalAmount: string;
        shares: Array<{ status: string }>;
      };
    };
    expect(revisionPayload.proposal).toMatchObject({
      revisionNumber: 2,
      supersedesProposalId: proposalId,
      title: revisedTitle,
      status: "SUBMITTED",
    });
    expect(revisionPayload.proposal.originalAmount).toBe("72");
    expect(revisionPayload.proposal.shares).toEqual([
      expect.objectContaining({ status: "PENDING" }),
    ]);
    await page.waitForURL(`**/expenses/proposals/${revisionPayload.proposal.id}`);
    await expect(page.getByRole("heading", { name: revisedTitle })).toBeVisible();

    const oldProposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/expenses/proposals/${proposalId}`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(oldProposalResponse.ok()).toBeTruthy();
    const oldProposalPayload = (await oldProposalResponse.json()) as {
      proposal: { status: string };
    };
    expect(oldProposalPayload.proposal.status).toBe("CANCELLED");

    const balancesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(balancesResponse.ok()).toBeTruthy();
    const balancesPayload = (await balancesResponse.json()) as { balances: unknown[] };
    expect(balancesPayload.balances).toEqual([]);
  });

  test("debtor settles a suggested transfer across multiple obligations", async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `multi-settle-owner+${suffix}@example.test`;
    const debtorEmail = `multi-settle-debtor+${suffix}@example.test`;
    const householdName = `Multi Settlement House ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Multi Settlement Owner E2E");
    const householdResponse = await postApiWithRetry(page, "/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const householdId = householdPayload.household.id;
    const invitePayload = await createInviteWithRetry(
      page,
      householdId,
      {
        email: debtorEmail,
        role: "MEMBER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, debtorEmail, "Multi Settlement Debtor E2E");
    const acceptResponse = await postApiWithRetry(page, "/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": debtorEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    const membersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(membersResponse.ok()).toBeTruthy();
    const membersPayload = (await membersResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
    };
    const ownerUserId = membersPayload.members.find(
      (member) => member.email === ownerEmail,
    )?.userId;
    const debtorUserId = membersPayload.members.find(
      (member) => member.email === debtorEmail,
    )?.userId;
    expect(ownerUserId).toBeTruthy();
    expect(debtorUserId).toBeTruthy();
    if (!ownerUserId || !debtorUserId) {
      throw new Error("Expected owner and debtor users to exist.");
    }

    async function createApprovedObligation(originalAmount: string, title: string) {
      const proposalResponse = await postApiWithRetry(
        page,
        `/api/v1/households/${householdId}/expenses/proposals`,
        {
          data: {
            title,
            expenseDate: "2026-07-04",
            originalAmount,
            originalCurrency: "CNY",
            participantUserIds: [debtorUserId],
          },
          headers: {
            "Idempotency-Key": `multi-settle-proposal-${title}-${Date.now()}`,
            "x-roompire-dev-user-email": ownerEmail,
          },
        },
      );
      expect(proposalResponse.status()).toBe(201);
      const proposalPayload = (await proposalResponse.json()) as {
        proposal: {
          shares: Array<{ id: string; debtorUserId: string; creditorUserId: string }>;
        };
      };
      const shareId = proposalPayload.proposal.shares.find(
        (share) => share.debtorUserId === debtorUserId && share.creditorUserId === ownerUserId,
      )?.id;
      expect(shareId).toBeTruthy();

      const approvalResponse = await postApiWithRetry(
        page,
        `/api/v1/households/${householdId}/expenses/shares/${shareId}/approve`,
        {
          data: {},
          headers: {
            "Idempotency-Key": `multi-settle-approval-${shareId}-${Date.now()}`,
            "x-roompire-dev-user-email": debtorEmail,
          },
        },
      );
      expect(approvalResponse.ok()).toBeTruthy();
    }

    await createApprovedObligation("20", `Multi Settlement First ${suffix}`);
    await createApprovedObligation("40", `Multi Settlement Second ${suffix}`);

    const obligationsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(obligationsResponse.ok()).toBeTruthy();
    const obligationsPayload = (await obligationsResponse.json()) as {
      obligations: Array<{
        id: string;
        debtorUserId: string;
        creditorUserId: string;
        remainingAmount: string;
        settlementCurrency: string;
        status: string;
      }>;
    };
    const directObligations = obligationsPayload.obligations.filter(
      (obligation) =>
        obligation.debtorUserId === debtorUserId &&
        obligation.creditorUserId === ownerUserId &&
        obligation.settlementCurrency === "CNY" &&
        obligation.status === "OPEN",
    );
    expect(directObligations.map((obligation) => obligation.remainingAmount).sort()).toEqual([
      "10",
      "20",
    ]);
    const directObligationIds = directObligations.map((obligation) => obligation.id);
    const transferKey = `${debtorUserId}-${ownerUserId}-CNY`;

    await setDevSessionWithRetry(page, debtorEmail, "Multi Settlement Debtor E2E");
    await page.goto("/en-US/app/ledger");
    const suggestionRow = page.getByTestId(`settlement-suggestion-${transferKey}`);
    await expect(suggestionRow).toContainText(
      "Multi Settlement Debtor E2E pays Multi Settlement Owner E2E",
    );
    await expect(suggestionRow).toContainText("CNY 30");
    const suggestedForm = page.getByTestId(`suggested-settlement-form-${transferKey}`);
    await expect(suggestedForm).toContainText("Suggested transfer: CNY 30");
    await expect(suggestedForm).toContainText("2 direct obligations");
    await page.getByTestId(`suggested-settlement-amount-${transferKey}`).fill("30");
    await page.getByTestId(`suggested-settlement-date-${transferKey}`).fill("2026-07-04");
    await clickSuggestedSettlementSubmitWithRetry(page, transferKey);

    const submittedSettlementsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/settlements`,
      {
        headers: {
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(submittedSettlementsResponse.ok()).toBeTruthy();
    const submittedSettlementsPayload = (await submittedSettlementsResponse.json()) as {
      settlements: Array<{
        id: string;
        amount: string;
        currency: string;
        status: string;
        sourceTransaction: { sourceType: string | null; sourceId: string | null };
        allocations: unknown[];
      }>;
    };
    const submittedSettlement = submittedSettlementsPayload.settlements.find(
      (settlement) =>
        settlement.amount === "30" &&
        settlement.currency === "CNY" &&
        settlement.sourceTransaction.sourceType === "SettlementSuggestion",
    );
    expect(submittedSettlement).toMatchObject({
      amount: "30",
      currency: "CNY",
      status: "SUBMITTED",
      sourceTransaction: {
        sourceType: "SettlementSuggestion",
        sourceId: null,
      },
      allocations: [],
    });

    await setDevSessionWithRetry(page, ownerEmail, "Multi Settlement Owner E2E");
    await page.goto("/en-US/app/ledger");
    const pendingSettlementRow = page.getByTestId(`pending-settlement-${submittedSettlement!.id}`);
    await expect(pendingSettlementRow).toContainText("CNY 30");
    await expect(pendingSettlementRow).toContainText("Suggested transfer");
    await clickSettlementConfirmWithRetry(page, submittedSettlement!.id);

    const confirmedSettlementsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/settlements`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(confirmedSettlementsResponse.ok()).toBeTruthy();
    const confirmedSettlementsPayload =
      (await confirmedSettlementsResponse.json()) as typeof submittedSettlementsPayload;
    const confirmedSettlement = confirmedSettlementsPayload.settlements.find(
      (settlement) => settlement.id === submittedSettlement!.id,
    );
    expect(confirmedSettlement).toBeTruthy();
    expect(confirmedSettlement!.status).toBe("CONFIRMED");
    expect(
      confirmedSettlement!.allocations
        .map((allocation) => (allocation as { amountApplied: string }).amountApplied)
        .sort(),
    ).toEqual(["10", "20"]);

    const settledObligationsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(settledObligationsResponse.ok()).toBeTruthy();
    const settledObligationsPayload =
      (await settledObligationsResponse.json()) as typeof obligationsPayload;
    for (const obligationId of directObligationIds) {
      expect(
        settledObligationsPayload.obligations.find((obligation) => obligation.id === obligationId),
      ).toMatchObject({
        remainingAmount: "0",
        status: "SETTLED",
      });
    }

    const balancesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(balancesResponse.ok()).toBeTruthy();
    const balancesPayload = (await balancesResponse.json()) as { balances: unknown[] };
    expect(balancesPayload.balances).toEqual([]);

    const suggestionsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/settlement-suggestions`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(suggestionsResponse.ok()).toBeTruthy();
    const suggestionsPayload = (await suggestionsResponse.json()) as { suggestions: unknown[] };
    expect(suggestionsPayload.suggestions).toEqual([]);
  });

  test("household netting clearing settles a non-direct suggestion", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `clearing-owner+${suffix}@example.test`;
    const bobEmail = `clearing-bob+${suffix}@example.test`;
    const chenEmail = `clearing-chen+${suffix}@example.test`;
    const householdName = `Clearing House ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Clearing Owner E2E");
    const householdResponse = await postApiWithRetry(page, "/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const householdId = householdPayload.household.id;

    const bobInvite = await createInviteWithRetry(
      page,
      householdId,
      { email: bobEmail, role: "MEMBER" },
      ownerEmail,
    );
    const chenInvite = await createInviteWithRetry(
      page,
      householdId,
      { email: chenEmail, role: "MEMBER" },
      ownerEmail,
    );

    for (const [email, displayName, token] of [
      [bobEmail, "Clearing Bob E2E", bobInvite.token],
      [chenEmail, "Clearing Chen E2E", chenInvite.token],
    ] as const) {
      await setDevSessionWithRetry(page, email, displayName);
      const acceptResponse = await postApiWithRetry(page, "/api/v1/invites/accept", {
        data: { token },
        headers: {
          "x-roompire-dev-user-email": email,
        },
      });
      expect(acceptResponse.ok()).toBeTruthy();
    }

    await setDevSessionWithRetry(page, ownerEmail, "Clearing Owner E2E");
    await page.goto("/en-US/app");
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();
    await page.getByTestId("settings-household-clearing-policy").selectOption("HOUSEHOLD_NETTING");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();

    const membersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(membersResponse.ok()).toBeTruthy();
    const membersPayload = (await membersResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
    };
    const ownerUserId = membersPayload.members.find(
      (member) => member.email === ownerEmail,
    )?.userId;
    const bobUserId = membersPayload.members.find((member) => member.email === bobEmail)?.userId;
    const chenUserId = membersPayload.members.find((member) => member.email === chenEmail)?.userId;
    expect(ownerUserId).toBeTruthy();
    expect(bobUserId).toBeTruthy();
    expect(chenUserId).toBeTruthy();
    if (!ownerUserId || !bobUserId || !chenUserId) {
      throw new Error("Expected clearing test users to exist.");
    }

    async function createAdjustment(debtorUserId: string, creditorUserId: string, reason: string) {
      const response = await postApiWithRetry(
        page,
        `/api/v1/households/${householdId}/ledger/adjustments`,
        {
          data: {
            debtorUserId,
            creditorUserId,
            amount: "10",
            currency: "CNY",
            occurredAt: "2026-07-04",
            reason,
          },
          headers: {
            "Idempotency-Key": `clearing-adjustment-${reason}-${Date.now()}`,
            "x-roompire-dev-user-email": ownerEmail,
          },
        },
      );
      expect(response.status()).toBe(201);
      const payload = (await response.json()) as {
        transaction: { obligations: Array<{ id: string }> };
      };
      const obligationId = payload.transaction.obligations[0]?.id;
      expect(obligationId).toBeTruthy();
      return obligationId!;
    }

    const bobToOwnerObligationId = await createAdjustment(
      bobUserId,
      ownerUserId,
      `Clearing Bob to owner ${suffix}`,
    );
    const ownerToChenObligationId = await createAdjustment(
      ownerUserId,
      chenUserId,
      `Clearing owner to Chen ${suffix}`,
    );

    const suggestionsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/settlement-suggestions`,
      {
        headers: {
          "x-roompire-dev-user-email": bobEmail,
        },
      },
    );
    expect(suggestionsResponse.ok()).toBeTruthy();
    const suggestionsPayload = (await suggestionsResponse.json()) as {
      suggestions: Array<{
        debtorUserId: string;
        creditorUserId: string;
        amount: string;
        currency: string;
        directOpenObligationCount: number;
        actionability: "DIRECTLY_SETTLEABLE" | "CLEARING_SETTLEABLE" | "GUIDANCE_ONLY";
      }>;
    };
    expect(suggestionsPayload.suggestions).toContainEqual(
      expect.objectContaining({
        debtorUserId: bobUserId,
        creditorUserId: chenUserId,
        amount: "10",
        currency: "CNY",
        directOpenObligationCount: 0,
        actionability: "CLEARING_SETTLEABLE",
      }),
    );

    const transferKey = `${bobUserId}-${chenUserId}-CNY`;
    await setDevSessionWithRetry(page, bobEmail, "Clearing Bob E2E");
    await page.goto("/en-US/app/ledger");
    const suggestionRow = page.getByTestId(`settlement-suggestion-${transferKey}`);
    await expect(suggestionRow).toContainText("Clearing Bob E2E pays Clearing Chen E2E");
    await expect(suggestionRow).toContainText(
      "Household netting is enabled, so this non-direct transfer can be submitted for payee confirmation.",
    );
    const clearingForm = page.getByTestId(`suggested-settlement-form-${transferKey}`);
    await expect(clearingForm).toContainText("Household clearing: CNY 10");
    await page.getByTestId(`suggested-settlement-amount-${transferKey}`).fill("10");
    await page.getByTestId(`suggested-settlement-date-${transferKey}`).fill("2026-07-04");
    await clickSuggestedSettlementSubmitWithRetry(page, transferKey);

    const submittedSettlementsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/settlements`,
      {
        headers: {
          "x-roompire-dev-user-email": bobEmail,
        },
      },
    );
    expect(submittedSettlementsResponse.ok()).toBeTruthy();
    const submittedSettlementsPayload = (await submittedSettlementsResponse.json()) as {
      settlements: Array<{
        id: string;
        amount: string;
        currency: string;
        status: string;
        sourceTransaction: { sourceType: string | null; sourceId: string | null };
        allocations: Array<{ amountApplied: string; debtObligationId: string }>;
      }>;
    };
    const submittedSettlement = submittedSettlementsPayload.settlements.find(
      (settlement) =>
        settlement.amount === "10" &&
        settlement.currency === "CNY" &&
        settlement.sourceTransaction.sourceType === "SettlementClearing",
    );
    expect(submittedSettlement).toMatchObject({
      amount: "10",
      currency: "CNY",
      status: "SUBMITTED",
      sourceTransaction: {
        sourceType: "SettlementClearing",
        sourceId: null,
      },
      allocations: [],
    });

    await setDevSessionWithRetry(page, chenEmail, "Clearing Chen E2E");
    await page.goto("/en-US/app/ledger");
    const pendingSettlementRow = page.getByTestId(`pending-settlement-${submittedSettlement!.id}`);
    await expect(pendingSettlementRow).toContainText("CNY 10");
    await expect(pendingSettlementRow).toContainText("Household clearing");
    await clickSettlementConfirmWithRetry(page, submittedSettlement!.id);

    const confirmedSettlementsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/settlements`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(confirmedSettlementsResponse.ok()).toBeTruthy();
    const confirmedSettlementsPayload =
      (await confirmedSettlementsResponse.json()) as typeof submittedSettlementsPayload;
    const confirmedSettlement = confirmedSettlementsPayload.settlements.find(
      (settlement) => settlement.id === submittedSettlement!.id,
    );
    expect(confirmedSettlement).toBeTruthy();
    expect(confirmedSettlement!.status).toBe("CONFIRMED");
    expect(
      confirmedSettlement!.allocations.map((allocation) => allocation.amountApplied).sort(),
    ).toEqual(["10", "10"]);
    expect(
      confirmedSettlement!.allocations.map((allocation) => allocation.debtObligationId).sort(),
    ).toEqual([bobToOwnerObligationId, ownerToChenObligationId].sort());

    const settledObligationsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/ledger/obligations`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(settledObligationsResponse.ok()).toBeTruthy();
    const settledObligationsPayload = (await settledObligationsResponse.json()) as {
      obligations: Array<{ id: string; remainingAmount: string; status: string }>;
    };
    for (const obligationId of [bobToOwnerObligationId, ownerToChenObligationId]) {
      expect(
        settledObligationsPayload.obligations.find((obligation) => obligation.id === obligationId),
      ).toMatchObject({
        remainingAmount: "0",
        status: "SETTLED",
      });
    }

    const balancesResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(balancesResponse.ok()).toBeTruthy();
    const balancesPayload = (await balancesResponse.json()) as { balances: unknown[] };
    expect(balancesPayload.balances).toEqual([]);
  });

  test("debtor rejects a submitted expense share without ledger impact", async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `reject-owner+${suffix}@example.test`;
    const debtorEmail = `reject-debtor+${suffix}@example.test`;
    const householdName = `Reject House ${suffix}`;
    const proposalTitle = `E2E Utilities ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Reject Owner E2E");
    const householdResponse = await page.request.post("/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const invitePayload = await createInviteWithRetry(
      page,
      householdPayload.household.id,
      {
        email: debtorEmail,
        role: "MEMBER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, debtorEmail, "Reject Debtor E2E");
    const acceptResponse = await page.request.post("/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": debtorEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    await setDevSessionWithRetry(page, ownerEmail, "Reject Owner E2E");
    await page.goto("/en-US/app");

    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();
    await page.getByTestId("expense-title").fill(proposalTitle);
    await page.getByTestId("expense-merchant").fill("LADWP");
    await page.getByTestId("expense-date").fill("2026-07-03");
    await page.getByTestId("expense-amount").fill("80");
    await page.getByTestId("expense-original-currency").fill("CNY");
    await page.getByTestId(`expense-debtor-${debtorEmail}`).check();
    await clickExpenseProposalSubmitWithRetry(page);

    await Promise.all([
      page.waitForURL("**/expenses/proposals/**"),
      page.getByRole("link", { name: `Open detail: ${proposalTitle}` }).click(),
    ]);
    await expect(page.getByRole("heading", { name: proposalTitle })).toBeVisible();
    const detailUrl = page.url();
    const detailIds = parseProposalDetailUrl(detailUrl);
    const proposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/proposals/${detailIds.proposalId}`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(proposalResponse.ok()).toBeTruthy();
    const proposalPayload = (await proposalResponse.json()) as {
      proposal: { shares: Array<{ id: string }> };
    };
    const shareId = proposalPayload.proposal.shares[0]?.id;
    expect(shareId).toBeTruthy();

    await setDevSessionWithRetry(page, debtorEmail, "Reject Debtor E2E");
    await page.goto(detailUrl);
    await expect(page.getByRole("button", { name: "Reject share" })).toBeVisible();
    await clickShareRejectWithRetry(page, shareId!, "Wrong utility period");

    await expect(page.getByText("Rejected").first()).toBeVisible();
    await expect(
      page.getByText("No formal ledger obligation has been created for this proposal."),
    ).toBeVisible();

    const rejectIdempotencyKey = `reject-idempotency-${Date.now()}`;
    const rejectReplayBody = { reason: "Wrong utility period" };
    const rejectReplayResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${shareId}/reject`,
      {
        data: rejectReplayBody,
        headers: {
          "Idempotency-Key": rejectIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(rejectReplayResponse.ok()).toBeTruthy();
    const rejectReplayPayload = (await rejectReplayResponse.json()) as {
      proposal: { id: string };
    };

    const rejectSecondReplayResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${shareId}/reject`,
      {
        data: rejectReplayBody,
        headers: {
          "Idempotency-Key": rejectIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(rejectSecondReplayResponse.ok()).toBeTruthy();
    const rejectSecondReplayPayload =
      (await rejectSecondReplayResponse.json()) as typeof rejectReplayPayload;
    expect(rejectSecondReplayPayload.proposal.id).toBe(rejectReplayPayload.proposal.id);

    const rejectConflictResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${detailIds.householdId}/expenses/shares/${shareId}/reject`,
      {
        data: { reason: "Changed rejection reason" },
        headers: {
          "Idempotency-Key": rejectIdempotencyKey,
          "x-roompire-dev-user-email": debtorEmail,
        },
      },
    );
    expect(rejectConflictResponse.status()).toBe(409);

    await page.goto("/en-US/app");
    await expect(page.getByTestId("dashboard-stat-matured-obligations")).toContainText("0");
    await expect(page.getByText("No approved obligations yet")).toBeVisible();
  });

  test("member creates calendar work and completes an assigned task", async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `calendar-owner+${suffix}@example.test`;
    const memberEmail = `calendar-member+${suffix}@example.test`;
    const householdName = `Calendar House ${suffix}`;
    const eventTitle = `E2E Rent review ${suffix}`;
    const taskTitle = `E2E Kitchen reset ${suffix}`;
    const eventProposalTitle = `E2E Event reimbursement ${suffix}`;
    const taskProposalTitle = `E2E Task reimbursement ${suffix}`;

    await setDevSessionWithRetry(page, ownerEmail, "Calendar Owner E2E");
    const householdResponse = await page.request.post("/api/v1/households", {
      data: {
        name: householdName,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const householdId = householdPayload.household.id;
    const invitePayload = await createInviteWithRetry(
      page,
      householdId,
      {
        email: memberEmail,
        role: "MEMBER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, memberEmail, "Calendar Member E2E");
    const acceptResponse = await page.request.post("/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": memberEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    const membersResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/members`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(membersResponse.ok()).toBeTruthy();
    const membersPayload = (await membersResponse.json()) as {
      members: Array<{ userId: string; email: string }>;
    };
    const ownerUserId = membersPayload.members.find(
      (member) => member.email === ownerEmail,
    )?.userId;
    expect(ownerUserId).toBeTruthy();
    if (!ownerUserId) {
      throw new Error("Expected owner user id in calendar members payload");
    }
    const memberUserId = membersPayload.members.find(
      (member) => member.email === memberEmail,
    )?.userId;
    expect(memberUserId).toBeTruthy();
    if (!memberUserId) {
      throw new Error("Expected member user id in calendar members payload");
    }

    await setDevSessionWithRetry(page, ownerEmail, "Calendar Owner E2E");
    await page.goto("/en-US/app/calendar");

    await expect(page.getByRole("heading", { name: "Calendar and tasks" })).toBeVisible();
    await expect(page.getByText(householdName)).toBeVisible();
    await page.getByTestId("calendar-event-title").fill(eventTitle);
    await page.getByTestId("calendar-event-type").selectOption("BILL_DUE");
    await page.getByTestId("calendar-event-start").fill("2026-07-09T09:00");
    await page.getByTestId("calendar-event-recurrence").selectOption("WEEKLY");
    await page.getByTestId("calendar-event-recurrence-count").fill("3");
    await page.getByTestId("calendar-event-description").fill("Review rent payment status");
    await clickCalendarEventSubmitWithRetry(page);
    await expect(page.getByText(eventTitle).first()).toBeVisible();

    await page.getByTestId("task-title").fill(taskTitle);
    await page.getByTestId("task-priority").selectOption("HIGH");
    await page.getByTestId("task-due-at").fill("2026-07-09T10:00");
    await page.getByTestId("task-recurrence").selectOption("WEEKLY");
    await page.getByTestId("task-recurrence-count").fill("2");
    await page.getByTestId(`task-assignee-row-${memberEmail}`).click();
    await expect(page.getByTestId(`task-assignee-${memberEmail}`)).toBeChecked();
    await page.getByTestId("task-description").fill("Reset counters and recycling");
    await clickTaskSubmitWithRetry(page);
    await expect(page.getByText(taskTitle).first()).toBeVisible();

    const tasksResponse = await getApiWithRetry(page, `/api/v1/households/${householdId}/tasks`, {
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(tasksResponse.ok()).toBeTruthy();
    const tasksPayload = (await tasksResponse.json()) as {
      tasks: Array<{
        id: string;
        title: string;
        status: string;
        dueAt: string | null;
        assignments: Array<{ assignedUserId: string; status: string }>;
        linkedEventIds: string[];
        linkedProposalIds: string[];
      }>;
    };
    const createdTasks = tasksPayload.tasks.filter((task) => task.title === taskTitle);
    expect(createdTasks).toHaveLength(2);
    const createdTask =
      createdTasks.find((task) => task.dueAt?.startsWith("2026-07-09T10:00")) ?? createdTasks[0];
    expect(createdTask).toBeTruthy();
    expect(createdTask!.status).toBe("OPEN");
    expect(createdTask!.assignments).toHaveLength(1);
    expect(createdTask!.linkedEventIds).toHaveLength(1);
    expect(createdTask!.linkedProposalIds).toHaveLength(0);
    for (const task of createdTasks) {
      expect(task).toMatchObject({
        status: "OPEN",
        assignments: [expect.objectContaining({ status: "ASSIGNED" })],
      });
      expect(task.linkedEventIds).toHaveLength(1);
      expect(task.linkedProposalIds).toHaveLength(0);
    }

    const eventsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/calendar/events`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(eventsResponse.ok()).toBeTruthy();
    const eventsPayload = (await eventsResponse.json()) as {
      events: Array<{
        id: string;
        title: string;
        type: string;
        status: string;
        startAt: string;
        links: Array<{ linkedType: string; linkedId: string }>;
      }>;
    };
    const recurringEvents = eventsPayload.events.filter(
      (event) => event.title === eventTitle && event.type === "BILL_DUE",
    );
    expect(recurringEvents).toHaveLength(3);
    expect(recurringEvents.map((event) => event.startAt.slice(0, 10))).toEqual([
      "2026-07-09",
      "2026-07-16",
      "2026-07-23",
    ]);
    expect(
      recurringEvents.every((event) =>
        event.links.some((link) => link.linkedType === "recurrence_rule"),
      ),
    ).toBe(true);

    const eventExpenseSource = recurringEvents[0]!;
    await page.getByTestId(`event-expense-toggle-${eventExpenseSource.id}`).click();
    await expect(page.getByTestId(`event-expense-form-${eventExpenseSource.id}`)).toBeVisible();
    await page.getByTestId(`event-expense-title-${eventExpenseSource.id}`).fill(eventProposalTitle);
    await page.getByTestId(`event-expense-merchant-${eventExpenseSource.id}`).fill("Event vendor");
    await page.getByTestId(`event-expense-amount-${eventExpenseSource.id}`).fill("150");
    await page.getByTestId(`event-expense-original-currency-${eventExpenseSource.id}`).fill("CNY");
    await page.getByTestId(`event-expense-fx-rate-${eventExpenseSource.id}`).fill("1");
    await page.getByTestId(`event-expense-debtor-${eventExpenseSource.id}-${memberEmail}`).check();
    await clickEventExpenseProposalSubmitWithRetry(page, eventExpenseSource.id);

    const eventLinkedProposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/calendar/events`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(eventLinkedProposalResponse.ok()).toBeTruthy();
    const eventLinkedProposalPayload =
      (await eventLinkedProposalResponse.json()) as typeof eventsPayload;
    const eventWithProposal = eventLinkedProposalPayload.events.find(
      (event) => event.id === eventExpenseSource.id,
    );
    const eventProposalId = eventWithProposal?.links.find(
      (link) => link.linkedType === "expense_proposal",
    )?.linkedId;
    expect(eventProposalId).toBeTruthy();
    if (!eventProposalId) {
      throw new Error("Expected event-generated expense proposal link");
    }

    await expect(
      page.getByTestId(`event-proposal-link-${eventExpenseSource.id}-${eventProposalId}`),
    ).toBeVisible();

    const eventProposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/expenses/proposals/${eventProposalId}`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(eventProposalResponse.ok()).toBeTruthy();
    const eventProposalPayload = (await eventProposalResponse.json()) as {
      proposal: {
        id: string;
        title: string;
        status: string;
        originalAmount: string;
        originalCurrency: string;
        settlementAmount: string;
        settlementCurrency: string;
        shares: Array<{
          debtorUserId: string;
          creditorUserId: string;
          status: string;
          ledgerObligationId: string | null;
        }>;
      };
    };
    expect(eventProposalPayload.proposal).toMatchObject({
      id: eventProposalId,
      title: eventProposalTitle,
      status: "SUBMITTED",
      originalAmount: "150",
      originalCurrency: "CNY",
      settlementAmount: "150",
      settlementCurrency: "CNY",
    });
    expect(eventProposalPayload.proposal.shares).toHaveLength(1);
    expect(eventProposalPayload.proposal.shares[0]).toMatchObject({
      debtorUserId: memberUserId,
      creditorUserId: ownerUserId,
      status: "PENDING",
      ledgerObligationId: null,
    });

    const balancesAfterEventProposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(balancesAfterEventProposalResponse.ok()).toBeTruthy();
    const balancesAfterEventProposalPayload = (await balancesAfterEventProposalResponse.json()) as {
      balances: unknown[];
    };
    expect(balancesAfterEventProposalPayload.balances).toHaveLength(0);

    const eventProposalIdempotencyKey = `event-proposal-idempotency-${Date.now()}`;
    const eventProposalReplayBody = {
      title: `E2E API event reimbursement ${suffix}`,
      originalAmount: "27.00",
      originalCurrency: "CNY",
      fxRate: "1",
      participantUserIds: [memberUserId],
      splitMethod: "EQUAL",
    };
    const eventProposalReplayResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/calendar/events/${recurringEvents[1]!.id}/create-expense-proposal`,
      {
        data: eventProposalReplayBody,
        headers: {
          "Idempotency-Key": eventProposalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(eventProposalReplayResponse.ok()).toBeTruthy();
    const eventProposalReplayPayload = (await eventProposalReplayResponse.json()) as {
      proposal: { id: string; status: string };
    };
    expect(eventProposalReplayPayload.proposal.status).toBe("SUBMITTED");

    const eventProposalSecondReplayResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/calendar/events/${recurringEvents[1]!.id}/create-expense-proposal`,
      {
        data: eventProposalReplayBody,
        headers: {
          "Idempotency-Key": eventProposalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(eventProposalSecondReplayResponse.ok()).toBeTruthy();
    const eventProposalSecondReplayPayload =
      (await eventProposalSecondReplayResponse.json()) as typeof eventProposalReplayPayload;
    expect(eventProposalSecondReplayPayload.proposal.id).toBe(
      eventProposalReplayPayload.proposal.id,
    );

    const eventProposalConflictResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/calendar/events/${recurringEvents[1]!.id}/create-expense-proposal`,
      {
        data: {
          ...eventProposalReplayBody,
          originalAmount: "28.00",
        },
        headers: {
          "Idempotency-Key": eventProposalIdempotencyKey,
          "x-roompire-dev-user-email": ownerEmail,
        },
      },
    );
    expect(eventProposalConflictResponse.status()).toBe(409);

    await page.getByTestId("calendar-view-month").click();
    await expect(page.getByTestId("calendar-month-view")).toBeVisible();
    await expect(page.getByTestId(`calendar-month-event-${recurringEvents[0]!.id}`)).toContainText(
      eventTitle,
    );
    await page.getByTestId("calendar-view-week").click();
    await expect(page.getByTestId("calendar-week-view")).toBeVisible();
    await expect(page.getByTestId(`calendar-week-event-${recurringEvents[0]!.id}`)).toContainText(
      eventTitle,
    );
    await page.getByTestId("calendar-view-list").click();
    const taskEvents = eventsPayload.events.filter(
      (event) => event.title === taskTitle && event.type === "TASK",
    );
    expect(taskEvents).toHaveLength(2);
    const taskEvent = taskEvents.find((event) =>
      event.links.some((link) => link.linkedType === "task" && link.linkedId === createdTask!.id),
    );
    expect(taskEvent).toBeTruthy();
    expect(taskEvent!.links).toContainEqual(
      expect.objectContaining({
        linkedType: "task",
        linkedId: createdTask!.id,
      }),
    );
    expect(taskEvent!.links).toContainEqual(
      expect.objectContaining({
        linkedType: "recurrence_rule",
      }),
    );

    await setDevSessionWithRetry(page, memberEmail, "Calendar Member E2E");
    await page.goto("/en-US/app/calendar");
    await expect(page.getByText(taskTitle).first()).toBeVisible();
    await clickTaskCompleteWithRetry(page, createdTask!.id);

    const completedTasksResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/tasks`,
      {
        headers: {
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(completedTasksResponse.ok()).toBeTruthy();
    const completedTasksPayload = (await completedTasksResponse.json()) as typeof tasksPayload;
    const completedTask = completedTasksPayload.tasks.find((task) => task.id === createdTask!.id);
    expect(completedTask).toMatchObject({
      id: createdTask!.id,
      status: "COMPLETED",
    });
    expect(completedTask!.assignments).toContainEqual(
      expect.objectContaining({
        assignedUserId: createdTask!.assignments[0]!.assignedUserId,
        status: "COMPLETED",
      }),
    );

    const completedEventsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/calendar/events`,
      {
        headers: {
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(completedEventsResponse.ok()).toBeTruthy();
    const completedEventsPayload = (await completedEventsResponse.json()) as typeof eventsPayload;
    expect(completedEventsPayload.events.find((event) => event.id === taskEvent!.id)).toMatchObject(
      {
        id: taskEvent!.id,
        status: "COMPLETED",
      },
    );
    const remainingTaskEvent = completedEventsPayload.events.find(
      (event) => event.title === taskTitle && event.id !== taskEvent!.id,
    );
    expect(remainingTaskEvent).toMatchObject({
      status: "OPEN",
    });

    await page.getByTestId(`task-expense-toggle-${createdTask!.id}`).click();
    await expect(page.getByTestId(`task-expense-form-${createdTask!.id}`)).toBeVisible();
    await page.getByTestId(`task-expense-title-${createdTask!.id}`).fill(taskProposalTitle);
    await page.getByTestId(`task-expense-merchant-${createdTask!.id}`).fill("Task supplies");
    await page.getByTestId(`task-expense-date-${createdTask!.id}`).fill("2026-07-09");
    await page.getByTestId(`task-expense-amount-${createdTask!.id}`).fill("48");
    await page.getByTestId(`task-expense-original-currency-${createdTask!.id}`).fill("CNY");
    await page.getByTestId(`task-expense-fx-rate-${createdTask!.id}`).fill("1");
    await page.getByTestId(`task-expense-debtor-${createdTask!.id}-${ownerEmail}`).check();
    await clickTaskExpenseProposalSubmitWithRetry(page, createdTask!.id);

    const taskLinkedProposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/tasks`,
      {
        headers: {
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(taskLinkedProposalResponse.ok()).toBeTruthy();
    const taskLinkedProposalPayload =
      (await taskLinkedProposalResponse.json()) as typeof tasksPayload;
    const taskWithProposal = taskLinkedProposalPayload.tasks.find(
      (task) => task.id === createdTask!.id,
    );
    expect(taskWithProposal!.linkedProposalIds).toHaveLength(1);
    const taskProposalId = taskWithProposal!.linkedProposalIds[0]!;

    await expect(
      page.getByTestId(`task-proposal-link-${createdTask!.id}-${taskProposalId}`),
    ).toBeVisible();

    const taskProposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/expenses/proposals/${taskProposalId}`,
      {
        headers: {
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(taskProposalResponse.ok()).toBeTruthy();
    const taskProposalPayload = (await taskProposalResponse.json()) as {
      proposal: {
        id: string;
        title: string;
        status: string;
        originalAmount: string;
        originalCurrency: string;
        settlementAmount: string;
        settlementCurrency: string;
        shares: Array<{
          debtorUserId: string;
          creditorUserId: string;
          status: string;
          ledgerObligationId: string | null;
        }>;
      };
    };
    expect(taskProposalPayload.proposal).toMatchObject({
      id: taskProposalId,
      title: taskProposalTitle,
      status: "SUBMITTED",
      originalAmount: "48",
      originalCurrency: "CNY",
      settlementAmount: "48",
      settlementCurrency: "CNY",
    });
    expect(taskProposalPayload.proposal.shares).toHaveLength(1);
    expect(taskProposalPayload.proposal.shares[0]).toMatchObject({
      debtorUserId: ownerUserId,
      status: "PENDING",
      ledgerObligationId: null,
    });

    const proposalLinkedEventsResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/calendar/events`,
      {
        headers: {
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(proposalLinkedEventsResponse.ok()).toBeTruthy();
    const proposalLinkedEventsPayload =
      (await proposalLinkedEventsResponse.json()) as typeof eventsPayload;
    expect(
      proposalLinkedEventsPayload.events.find((event) => event.id === taskEvent!.id)?.links,
    ).toContainEqual(
      expect.objectContaining({
        linkedType: "expense_proposal",
        linkedId: taskProposalId,
      }),
    );

    const balancesAfterTaskProposalResponse = await getApiWithRetry(
      page,
      `/api/v1/households/${householdId}/balances`,
      {
        headers: {
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(balancesAfterTaskProposalResponse.ok()).toBeTruthy();
    const balancesAfterTaskProposalPayload = (await balancesAfterTaskProposalResponse.json()) as {
      balances: unknown[];
    };
    expect(balancesAfterTaskProposalPayload.balances).toHaveLength(0);

    const nextTask = createdTasks.find((task) => task.id !== createdTask!.id);
    expect(nextTask).toBeTruthy();
    if (!nextTask) {
      throw new Error("Expected recurring task instance for idempotency coverage");
    }

    const taskProposalIdempotencyKey = `task-proposal-idempotency-${Date.now()}`;
    const taskProposalReplayBody = {
      title: `E2E API task reimbursement ${suffix}`,
      expenseDate: "2026-07-16",
      originalAmount: "12.00",
      originalCurrency: "CNY",
      fxRate: "1",
      participantUserIds: [ownerUserId],
      splitMethod: "EQUAL",
    };
    const taskProposalReplayResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/tasks/${nextTask.id}/create-expense-proposal`,
      {
        data: taskProposalReplayBody,
        headers: {
          "Idempotency-Key": taskProposalIdempotencyKey,
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(taskProposalReplayResponse.ok()).toBeTruthy();
    const taskProposalReplayPayload = (await taskProposalReplayResponse.json()) as {
      proposal: { id: string; status: string };
    };
    expect(taskProposalReplayPayload.proposal.status).toBe("SUBMITTED");

    const taskProposalSecondReplayResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/tasks/${nextTask.id}/create-expense-proposal`,
      {
        data: taskProposalReplayBody,
        headers: {
          "Idempotency-Key": taskProposalIdempotencyKey,
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(taskProposalSecondReplayResponse.ok()).toBeTruthy();
    const taskProposalSecondReplayPayload =
      (await taskProposalSecondReplayResponse.json()) as typeof taskProposalReplayPayload;
    expect(taskProposalSecondReplayPayload.proposal.id).toBe(taskProposalReplayPayload.proposal.id);

    const taskProposalConflictResponse = await postApiWithRetry(
      page,
      `/api/v1/households/${householdId}/tasks/${nextTask.id}/create-expense-proposal`,
      {
        data: {
          ...taskProposalReplayBody,
          originalAmount: "13.00",
        },
        headers: {
          "Idempotency-Key": taskProposalIdempotencyKey,
          "x-roompire-dev-user-email": memberEmail,
        },
      },
    );
    expect(taskProposalConflictResponse.status()).toBe(409);
  });

  test("viewer cannot create household invites", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `viewer-owner+${suffix}@example.test`;
    const viewerEmail = `viewer+${suffix}@example.test`;
    const blockedEmail = `blocked+${suffix}@example.test`;
    await setDevSessionWithRetry(page, ownerEmail, "Viewer Owner E2E");

    const householdResponse = await page.request.post("/api/v1/households", {
      data: {
        name: `Viewer House ${suffix}`,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
      headers: {
        "x-roompire-dev-user-email": ownerEmail,
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const householdId = householdPayload.household.id;
    const invitePayload = await createInviteWithRetry(
      page,
      householdId,
      {
        email: viewerEmail,
        role: "VIEWER",
      },
      ownerEmail,
    );

    await setDevSessionWithRetry(page, viewerEmail, "Viewer E2E");
    const acceptResponse = await page.request.post("/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
      headers: {
        "x-roompire-dev-user-email": viewerEmail,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    await page.goto("/en-US/app");

    await expect(page.getByText("Signed in as Viewer E2E")).toBeVisible();
    await expect(page.getByText("Viewers cannot create expense proposals.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit proposal" })).toBeDisabled();
    await page.getByLabel("Invite email").fill(blockedEmail);
    await page.getByRole("button", { name: "Create invite" }).click();

    await expect(
      page.getByText("Only household owners and admins can manage members."),
    ).toBeVisible();

    await page.goto("/en-US/app/calendar");
    await expect(page.getByText("Viewers can browse calendar work")).toBeVisible();
    await expect(page.getByTestId("calendar-event-submit")).toBeDisabled();
    await expect(page.getByTestId("task-submit")).toBeDisabled();
    await expect(
      postViewerCalendarEventWithRetry(page, householdId, viewerEmail, `Viewer blocked ${suffix}`),
    ).resolves.toBe(403);

    const viewerTaskProposalResponse = await page.request.post(
      `/api/v1/households/${householdId}/tasks/00000000-0000-0000-0000-000000000000/create-expense-proposal`,
      {
        data: {
          expenseDate: "2026-07-09",
          originalAmount: "10.00",
          originalCurrency: "CNY",
          fxRate: "1",
          participantUserIds: [],
          splitMethod: "EQUAL",
        },
        headers: {
          "Idempotency-Key": `viewer-task-proposal-${Date.now()}`,
          "x-roompire-dev-user-email": viewerEmail,
        },
      },
    );
    expect(viewerTaskProposalResponse.status()).toBe(403);
  });
});
