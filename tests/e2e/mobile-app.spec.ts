import { test, expect } from "@playwright/test";
import { loadEnvFile } from "node:process";
import fs from "node:fs";
import { syntheticStaff } from "./staff-fixture";
if (fs.existsSync(".env")) loadEnvFile(".env");
test.setTimeout(120000);
test("public mobile navigation fits small screens and opens bookings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "เมนูมือถือ", exact: true });
  await expect(nav).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "แพ็กเกจ", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await nav.getByRole("link", { name: "นัดของฉัน" }).click();
  await expect(page).toHaveURL(/bookings/);
  await expect(nav.getByRole("link", { name: "นัดของฉัน" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/mobile-public.png",
    fullPage: true,
  });
});
test("staff mobile drawer is modal and table rows become labelled cards", async ({
  page,
}) => {
  test.skip(
    process.env.SEED_DEMO !== "true",
    "Synthetic localhost development only",
  );
  const actor = await syntheticStaff("superadmin");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (
        await page.request.post("/api/v1/auth/login", {
          headers: { Origin: "http://localhost:3036" },
          data: {
            email: actor.email,
            password: actor.password,
            mfa: actor.mfa(),
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/admin/users");
    const nav = page.getByRole("navigation", { name: "เมนูด่วนเจ้าหน้าที่" });
    await expect(nav).toBeVisible();
    const menu = nav.getByRole("button", { name: "เมนูทั้งหมด" });
    await menu.click();
    const dialog = page.getByRole("dialog", {
      name: "เมนูเจ้าหน้าที่",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "จัดการผู้ใช้งาน", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
    const table = page.locator(".responsive-table").first();
    await expect(table.locator("tbody tr").first()).toBeVisible();
    expect(await table.locator("tbody td[data-label]").count()).toBeGreaterThan(
      2,
    );
    expect(
      await table
        .locator("tbody tr")
        .first()
        .evaluate((node) => getComputedStyle(node).display),
    ).toBe("block");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/mobile-staff.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(nav).toBeHidden();
    await expect(page.locator(".sidebar")).toBeVisible();
    expect(
      await table
        .locator("tbody tr")
        .first()
        .evaluate((node) => getComputedStyle(node).display),
    ).toBe("table-row");
  } finally {
    await actor.cleanup();
  }
});
