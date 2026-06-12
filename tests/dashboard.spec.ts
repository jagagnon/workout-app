import { test, expect } from "@playwright/test";
test("home renders ladder and sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Muscle-up ladder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "PR board" })).toBeVisible();
});
