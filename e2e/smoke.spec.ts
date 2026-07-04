import { expect, test, type Locator, type Page } from "@playwright/test";

async function clickMemberMutationWithRetry(
  page: Page,
  button: Locator,
  method: "PATCH" | "DELETE",
) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    await page.waitForTimeout(500);
  }

  throw new Error(`${method} member mutation failed with status ${lastStatus}`);
}

async function setDevSessionWithRetry(page: Page, email: string, displayName: string) {
  let lastStatus = 0;
  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
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

async function clickInviteCreateWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    await page.waitForTimeout(500);
  }

  throw new Error(`POST invite failed with status ${lastStatus}`);
}

async function clickHouseholdCreateWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    await page.waitForTimeout(500);
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

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    await page.waitForTimeout(500);
  }

  throw new Error(`POST invite API failed with status ${lastStatus}: ${lastBody}`);
}

async function clickExpenseProposalSubmitWithRetry(page: Page) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    await page.waitForTimeout(500);
  }

  throw new Error(`POST expense proposal failed with status ${lastStatus}`);
}

async function clickShareApproveWithRetry(page: Page, shareId: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    await page.waitForTimeout(500);
  }

  throw new Error(`POST share approve failed with status ${lastStatus}`);
}

async function clickShareRejectWithRetry(page: Page, shareId: string, reason: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    await page.waitForTimeout(500);
  }

  throw new Error(`POST share reject failed with status ${lastStatus}`);
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

    await expect(page.getByText("Settings saved")).toBeVisible();
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

    const forbiddenMembersResponse = await page.request.get(
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
    await page.getByTestId(`expense-debtor-${debtorEmail}`).check();
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
    await expect(
      page.getByText("No formal ledger obligation has been created for this proposal."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve share" })).toHaveCount(0);

    const detailUrl = page.url();
    const detailIds = parseProposalDetailUrl(detailUrl);
    const proposalResponse = await page.request.get(
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
        shares: Array<{
          id: string;
          debtorUserId: string;
          creditorUserId: string;
        }>;
      };
    };
    const approvedShare = proposalPayload.proposal.shares[0];
    const shareId = approvedShare?.id;
    expect(shareId).toBeTruthy();

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

    const balancesResponse = await page.request.get(
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

    const obligationsResponse = await page.request.get(
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

    const transactionsResponse = await page.request.get(
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
    const proposalResponse = await page.request.get(
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

    await page.goto("/en-US/app");
    await expect(page.getByTestId("dashboard-stat-matured-obligations")).toContainText("0");
    await expect(page.getByText("No approved obligations yet")).toBeVisible();
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
    const invitePayload = await createInviteWithRetry(
      page,
      householdPayload.household.id,
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
  });
});
