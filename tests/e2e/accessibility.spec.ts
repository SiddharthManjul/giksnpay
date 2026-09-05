import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const API_ORIGIN = "http://localhost:8787";
const APP_ORIGIN = "http://127.0.0.1:3310";
const ORGANIZATION_ID = "org_01JGFJH900H8M2APVYVDZ4R6AA";

test("critical public screens have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/", "/verify"] as const) {
    await page.goto(path);
    await assertNoSeriousAccessibilityViolations(page);
  }
});

test("the authenticated ledger shell has no serious accessibility violations", async ({ page }) => {
  await mockEmptyWorkspace(page);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Transaction authority." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create agent" }).first()).toBeVisible();
  await assertNoSeriousAccessibilityViolations(page);
});

test("tablet layout, reduced motion, keyboard focus, and reconnect behavior are explicit", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 1_024, width: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  const layout = await page.evaluate(() => ({
    animation: getComputedStyle(document.querySelector(".authority-row") as Element).animationName,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.animation).toBe("none");
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

  let transactionReads = 0;
  await mockEmptyWorkspace(page, () => {
    transactionReads += 1;
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Transaction authority." })).toBeVisible();
  const readsBeforeReconnect = transactionReads;
  await context.setOffline(true);
  await expect(page.getByText("Browser offline · state may be stale")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Browser online")).toBeVisible();
  await expect.poll(() => transactionReads).toBeGreaterThan(readsBeforeReconnect);
});

async function assertNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
}

async function mockEmptyWorkspace(page: Page, onTransactionRead: () => void = () => undefined) {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,x-mindpay-organization-id",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-origin": APP_ORIGIN,
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/me") {
      await route.fulfill({
        headers: corsHeaders,
        json: {
          organizations: [
            {
              access: {
                capabilities: ["organization:read", "member:read", "agent:read"],
                role: "VIEWER",
              },
              organization: {
                id: ORGANIZATION_ID,
                name: "Evidence Lab",
                slug: "evidence-lab",
                status: "ACTIVE",
              },
            },
          ],
          user: {
            email: "reviewer@mindpay.test",
            emailVerified: true,
            id: "usr_01JGFJH000H8M2APVYVDZ4R6A0",
            image: null,
            name: "Phase Ten Reviewer",
          },
        },
      });
      return;
    }
    if (path === "/api/v1/agents") {
      await route.fulfill({ headers: corsHeaders, json: { agents: [] } });
      return;
    }
    if (path === "/api/v1/mandates") {
      await route.fulfill({ headers: corsHeaders, json: { mandates: [] } });
      return;
    }
    if (path === "/api/v1/transactions") {
      onTransactionRead();
      await route.fulfill({ headers: corsHeaders, json: { transactions: [] } });
      return;
    }
    await route.fulfill({ headers: corsHeaders, status: 404 });
  });
}
