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

async function createInviteWithRetry(
  page: Page,
  householdId: string,
  data: { email: string; role: "ADMIN" | "MEMBER" | "VIEWER" },
) {
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await page.request.post(`/api/v1/households/${householdId}/invites`, {
      data,
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

test.describe("Roompire real browser smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post("/api/v1/dev/session", {
      data: {
        email: "alice@example.test",
        displayName: "Alice",
      },
    });
  });

  test("desktop user opens landing page and navigates to dashboard", async ({ page }) => {
    await page.goto("/en-US");

    await expect(page.getByRole("heading", { name: "Roompire" })).toBeVisible();
    await expect(page.getByText("No formal debt until approval")).toBeVisible();

    await page
      .getByRole("link", { name: /Open dashboard/ })
      .first()
      .click();

    await expect(page.getByRole("heading", { name: "USC 3B2B" })).toBeVisible();
    await expect(page.getByText("Pending proposals")).toBeVisible();
    await expect(page.getByText("No approved obligations yet")).toBeVisible();
  });

  test("mobile user sees zh-CN shell and protected-route failure state", async ({ page }) => {
    await page.goto("/zh-CN");

    await expect(page.getByRole("heading", { name: "Roompire" })).toBeVisible();
    await expect(page.getByText("审批前不形成正式债务")).toBeVisible();

    await page
      .getByRole("link", { name: /打开工作台/ })
      .first()
      .click();

    await expect(page.getByRole("heading", { name: "USC 3B2B" })).toBeVisible();
    await expect(page.getByText("暂无已批准债务")).toBeVisible();

    await page.goto("/zh-CN/app/forbidden");
    await expect(page.getByRole("heading", { name: "需要访问权限" })).toBeVisible();
    await expect(page.getByRole("link", { name: /返回工作台/ })).toBeVisible();
  });

  test("owner creates a household from the dashboard form", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `create-owner+${suffix}@example.test`;
    const householdName = `E2E Loft ${suffix}`;

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: ownerEmail,
        displayName: "Create Owner E2E",
      },
    });
    await page.goto("/en-US/app");
    await page.getByTestId("create-household-name").fill(householdName);
    await page.getByTestId("create-household-timezone").fill("America/Los_Angeles");
    await page.getByTestId("create-household-currency").fill("CNY");
    await page.getByRole("button", { name: "Create household" }).click();

    await expect(page.getByText("Household created")).toBeVisible();
    await expect(page.getByRole("heading", { name: householdName })).toBeVisible();
  });

  test("owner updates settings and manages a linked invitee", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `owner+${suffix}@example.test`;
    const inviteeEmail = `member+${suffix}@example.test`;
    const householdName = `E2E House ${suffix}`;
    const updatedName = `E2E House Updated ${suffix}`;

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: ownerEmail,
        displayName: "Owner E2E",
      },
    });

    await page.goto("/en-US/app");
    await expect(page.getByText("No households yet").first()).toBeVisible();
    await page.getByTestId("create-household-name").fill(householdName);
    await page.getByTestId("create-household-timezone").fill("America/Los_Angeles");
    await page.getByTestId("create-household-currency").fill("CNY");
    await page.getByRole("button", { name: "Create household" }).click();

    await expect(page.getByText("Household created")).toBeVisible();
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

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: inviteeEmail,
        displayName: "Member E2E",
      },
    });

    await page.goto(inviteHref!);
    await expect(page.getByRole("heading", { name: "Accept household invite" })).toBeVisible();
    await expect(page.getByText(`Join ${updatedName} as ${inviteeEmail}.`)).toBeVisible();
    await page.getByRole("button", { name: "Accept invite" }).click();
    await expect(page.getByText("Invite accepted")).toBeVisible();
    await page.getByRole("link", { name: /Open dashboard/ }).click();
    await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: ownerEmail,
        displayName: "Owner E2E",
      },
    });

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

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: ownerEmail,
        displayName: "Invite Owner E2E",
      },
    });
    await page.goto("/en-US/app");
    await page.getByTestId("create-household-name").fill(householdName);
    await page.getByTestId("create-household-timezone").fill("America/Los_Angeles");
    await page.getByTestId("create-household-currency").fill("CNY");
    await page.getByRole("button", { name: "Create household" }).click();
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

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: inviteeEmail,
        displayName: "Mia E2E",
      },
    });

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

  test("viewer cannot create household invites", async ({ page }, testInfo) => {
    const suffix = `${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}`;
    const ownerEmail = `viewer-owner+${suffix}@example.test`;
    const viewerEmail = `viewer+${suffix}@example.test`;
    const blockedEmail = `blocked+${suffix}@example.test`;
    const createResponse = await page.request.post("/api/v1/dev/session", {
      data: {
        email: ownerEmail,
        displayName: "Viewer Owner E2E",
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    const householdResponse = await page.request.post("/api/v1/households", {
      data: {
        name: `Viewer House ${suffix}`,
        timezone: "America/Los_Angeles",
        settlementCurrency: "CNY",
      },
    });
    expect(householdResponse.ok()).toBeTruthy();
    const householdPayload = (await householdResponse.json()) as {
      household: { id: string };
    };
    const invitePayload = await createInviteWithRetry(page, householdPayload.household.id, {
      email: viewerEmail,
      role: "VIEWER",
    });

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: viewerEmail,
        displayName: "Viewer E2E",
      },
    });
    const acceptResponse = await page.request.post("/api/v1/invites/accept", {
      data: {
        token: invitePayload.token,
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();

    await page.goto("/en-US/app");

    await expect(page.getByText("Signed in as Viewer E2E")).toBeVisible();
    await page.getByLabel("Invite email").fill(blockedEmail);
    await page.getByRole("button", { name: "Create invite" }).click();

    await expect(
      page.getByText("Only household owners and admins can manage members."),
    ).toBeVisible();
  });
});
