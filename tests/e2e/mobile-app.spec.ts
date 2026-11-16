import { test, expect } from "@playwright/test";
import { loadEnvFile } from "node:process";
import fs from "node:fs";
import { syntheticStaff } from "./staff-fixture";
if (fs.existsSync(".env")) loadEnvFile(".env");
test.setTimeout(120000);

test("public navigation has no horizontal overflow at target widths", async ({
  page,
}) => {
  await fs.promises.mkdir("docs/qa/2026-11-16", { recursive: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "เมนูมือถือ", exact: true });
  await expect(nav).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "แพ็กเกจ", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if ([320, 390, 1440].includes(width))
      await page.screenshot({
        path: `docs/qa/2026-11-16/rc02-public-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await nav.getByRole("link", { name: "นัดของฉัน" }).click();
  await expect(page).toHaveURL(/bookings/);
  await expect(nav.getByRole("link", { name: "นัดของฉัน" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("admin drawer, card tables and layout remain usable on mobile and desktop", async ({
  page,
  baseURL,
}) => {
  test.skip(
    process.env.PDH_TEST_ALLOW_SYNTHETIC_FIXTURES !== "true",
    "Requires the dedicated RC01 test database",
  );
  const actor = await syntheticStaff("superadmin");
  try {
    await fs.promises.mkdir("docs/qa/2026-11-16", { recursive: true });
    expect(
      (
        await page.request.post("/api/v1/auth/login", {
          headers: { Origin: baseURL ?? "http://localhost:3037" },
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
    const menu = nav.getByRole("button", { name: "เมนูทั้งหมด" });
    const table = page.locator(".responsive-table").first();
    for (const width of [320, 360, 375, 390, 430, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(nav).toBeVisible();
      await expect(table.locator("tbody tr").first()).toBeVisible();
      expect(
        await table.locator("tbody td[data-label]").count(),
      ).toBeGreaterThan(2);
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
      if ([320, 390].includes(width))
        await page.screenshot({
          path: `docs/qa/2026-11-16/rc02-admin-${width}.png`,
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 390, height: 844 });
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
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(nav).toBeHidden();
      await expect(page.locator(".sidebar")).toBeVisible();
      expect(
        await table
          .locator("tbody tr")
          .first()
          .evaluate((node) => getComputedStyle(node).display),
      ).toBe("table-row");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    await actor.cleanup();
  }
});
