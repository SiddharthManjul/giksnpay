import { expect, test } from "@playwright/test";

test("landing page states the MindPay authority model", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Money still needs authority",
  );
  await expect(page.getByText("No card data stored")).toBeVisible();
  await expect(page.getByRole("link", { name: "Run the controlled demo" })).toBeVisible();
});

test("public navigation, verifier entry, and keyboard skip link are usable", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("link", { name: "Verify evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Trust the proof, not the screenshot." }),
  ).toBeVisible();
  await expect(page.getByLabel("Evidence ID")).toBeEditable();
});

test("the public product remains contained at 360px", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 360 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
