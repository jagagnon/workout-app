import { test, expect } from "@playwright/test";

// The card titles are divs, not headings — asserting on headings that never existed
// meant this spec had been failing silently rather than guarding anything.
test("dashboard renders the ladder and its cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /muscle.?up project/i })).toBeVisible();
  await expect(page.getByText("Current Assist")).toBeVisible();
  await expect(page.getByText("PR Board")).toBeVisible();
  await expect(page.getByText("Recent Sessions")).toBeVisible();
});

test("current assist is dated so a stale reading is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stat-meta")).toContainText("as of");
});

test("all PRs is reachable and rows carry a unit caption", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /All PRs/ }).click();
  await expect(page.getByRole("heading", { name: "All PRs" })).toBeVisible();
  await expect(page.locator(".pr-row").first()).toBeVisible();
  await expect(page.locator(".pr-section-caption").first()).toBeVisible();
});

test("an exercise page opens from the PR board", async ({ page }) => {
  await page.goto("/prs");
  await page.locator(".pr-name").first().click();
  await expect(page.getByText("Progression")).toBeVisible();
});
