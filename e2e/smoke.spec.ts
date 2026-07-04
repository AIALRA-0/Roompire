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
        proposalCounts: { SUBMITTED: number };
        proposalSettlementTotals: Array<{ currency: string; amount: string }>;
        taskCounts: { open: number; completed: number };
        auditEventCount: number;
      };
    };
    expect(statsSummaryPayload.summary.proposalCounts.SUBMITTED).toBeGreaterThan(0);
    expect(statsSummaryPayload.summary.proposalSettlementTotals).toContainEqual(
      expect.objectContaining({ currency: "CNY" }),
    );
    expect(statsSummaryPayload.summary.auditEventCount).toBeGreaterThan(0);

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

    await expect(page.getByTestId("dashboard-stats-link")).toHaveAttribute(
      "href",
      "/en-US/app/stats",
    );
    await page.goto("/en-US/app/stats");

    await expect(page.getByRole("heading", { name: "Household statistics" })).toBeVisible();
    await expect(page.getByTestId("stats-summary-proposals")).toBeVisible();
    await expect(page.getByTestId("stats-summary-audit")).toBeVisible();
    await expect(page.getByTestId("export-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Category breakdown" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Member breakdown" })).toBeVisible();

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
      events: Array<{ action: string; entityType: string; occurredAt: string }>;
    };
    expect(auditPayload.events.length).toBeGreaterThan(0);
    expect(auditPayload.events).toContainEqual(
      expect.objectContaining({
        action: "expense_proposal.seeded",
        entityType: "ExpenseProposal",
      }),
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
    await expect(page.getByText("expense_proposal.seeded")).toBeVisible();
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
      },
    ]);

    await page.getByTestId(`settlement-amount-${primaryObligationId}`).fill("324");
    await page.getByTestId(`settlement-date-${primaryObligationId}`).fill("2026-07-04");
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
      }>;
    };
    expect(submittedSettlementsPayload.settlements).toHaveLength(1);
    expect(submittedSettlementsPayload.settlements[0]).toMatchObject({
      amount: "324",
      status: "SUBMITTED",
      allocations: [],
    });
    const submittedSettlementId = submittedSettlementsPayload.settlements[0]?.id;
    expect(submittedSettlementId).toBeTruthy();

    await setDevSessionWithRetry(page, ownerEmail, "Expense Owner E2E");
    await page.goto("/en-US/app/ledger");
    const pendingSettlementRow = page.getByTestId(`pending-settlement-${submittedSettlementId}`);
    await expect(pendingSettlementRow).toContainText("CNY 324");
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
      suggestions: Array<{ amount: string; currency: string }>;
    };
    expect(adjustmentSuggestionsPayload.suggestions).toEqual([
      {
        debtorUserId: approvedShare!.debtorUserId,
        creditorUserId: approvedShare!.creditorUserId,
        amount: "15",
        currency: "CNY",
        debtorOpenObligationCount: 1,
        creditorOpenObligationCount: 1,
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
