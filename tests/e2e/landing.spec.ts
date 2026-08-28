import { expect, test } from "@playwright/test";

test("landing page states the MindPay authority model", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "without giving it unchecked authority over money",
  );
  await expect(page.getByText("Razorpay Test Mode build in progress.")).toBeVisible();
});
