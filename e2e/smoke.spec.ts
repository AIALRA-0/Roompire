import { expect, test } from "@playwright/test";

test.describe("Roompire Phase 0 real browser smoke", () => {
  test("desktop user opens landing page and navigates to dashboard", async ({ page }) => {
    await page.goto("/en-US");

    await expect(page.getByRole("heading", { name: "Roompire" })).toBeVisible();
    await expect(page.getByText("No formal debt until approval")).toBeVisible();

    await page
      .getByRole("link", { name: /Open dashboard/ })
      .first()
      .click();

    await expect(page.getByRole("heading", { name: "USC 3B2B operations" })).toBeVisible();
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

    await expect(page.getByRole("heading", { name: "USC 3B2B 运营台" })).toBeVisible();
    await expect(page.getByText("暂无已批准债务")).toBeVisible();

    await page.goto("/zh-CN/app/forbidden");
    await expect(page.getByRole("heading", { name: "需要访问权限" })).toBeVisible();
    await expect(page.getByRole("link", { name: /返回工作台/ })).toBeVisible();
  });
});
