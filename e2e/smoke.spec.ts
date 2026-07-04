import { expect, test } from "@playwright/test";

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
    const householdName = `E2E Loft ${testInfo.project.name} ${Date.now()}`;

    await page.goto("/en-US/app");
    await page.getByLabel("Household name").fill(householdName);
    await page.getByLabel("Timezone").fill("America/Los_Angeles");
    await page.getByLabel("Settlement currency").fill("CNY");
    await page.getByRole("button", { name: "Create household" }).click();

    await expect(page.getByText("Household created")).toBeVisible();
    await expect(page.getByText(householdName)).toBeVisible();
  });

  test("invite flow enforces membership isolation before acceptance", async ({
    page,
  }, testInfo) => {
    const inviteeEmail = `mia+${testInfo.project.name.replace(/\W+/g, "-")}-${Date.now()}@example.test`;

    await page.goto("/en-US/app");
    const membersHref = await page
      .getByRole("link", { name: "Open members" })
      .first()
      .getAttribute("href");

    expect(membersHref).toBeTruthy();

    await page.getByLabel("Invite email").fill(inviteeEmail);
    await page.getByLabel("Invite role").selectOption("MEMBER");
    await page.getByRole("button", { name: "Create invite" }).click();

    await expect(page.getByText("Invite created")).toBeVisible();
    const inviteToken = await page.getByTestId("invite-token").innerText();

    await page.request.post("/api/v1/dev/session", {
      data: {
        email: inviteeEmail,
        displayName: "Mia E2E",
      },
    });

    await page.goto(membersHref!);
    await expect(page.getByRole("heading", { name: "Access request needed" })).toBeVisible();

    await page.goto("/en-US/app");
    await expect(page.getByText("No households yet").first()).toBeVisible();
    await page.getByLabel("Invite code").fill(inviteToken);
    await page.getByRole("button", { name: "Accept invite" }).click();

    await expect(page.getByText("Invite accepted")).toBeVisible();
    await expect(page.getByText("USC 3B2B")).toBeVisible();

    await page.goto(membersHref!);
    await expect(page.getByText("Mia E2E").first()).toBeVisible();
    await expect(page.getByText(inviteeEmail)).toBeVisible();
  });

  test("viewer cannot create household invites", async ({ page }) => {
    await page.goto("/en-US/app");
    await page.getByLabel("Dev user").selectOption("dana@example.test");
    await page.getByRole("button", { name: "Use dev user" }).click();

    await expect(page.getByText("Signed in as Dana")).toBeVisible();
    await page.getByLabel("Invite email").fill("blocked@example.test");
    await page.getByRole("button", { name: "Create invite" }).click();

    await expect(
      page.getByText("Only household owners and admins can manage members."),
    ).toBeVisible();
  });
});
