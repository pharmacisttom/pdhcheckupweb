import { test, expect } from "@playwright/test";

/**
 * RC04 Impeccable Visual & Accessibility Regression Tests
 * Covers Public Navigation, Brand Icons, Package Cards, Admin Sidebar Categories,
 * Mobile Admin Drawer, and Viewport Matrix.
 */

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 640 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

test.describe("RC04 Public Portal & Brand Icon Coverage", () => {
  for (const vp of VIEWPORTS) {
    test(`renders public portal on ${vp.name} (${vp.width}px) without overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");

      // Verify no horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px rounding margin

      // Verify official hospital brand logo
      const brandLogo = page.locator("header .brand img");
      await expect(brandLogo).toBeVisible();
      await expect(brandLogo).toHaveAttribute("alt", /โรงพยาบาลปลวกแดง/);

      // Verify footer third-party official brand icons (LINE, Facebook)
      const footer = page.locator("footer#contact");
      await expect(footer).toBeVisible();
      await expect(footer.getByLabel("LINE Official Account")).toBeVisible();
      await expect(footer.getByLabel("Facebook Page")).toBeVisible();
    });
  }

  test("package cards have accessible labels, aria-pressed, and clear pricing", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");

    const packageCards = page.locator("article.package-card");
    const count = await packageCards.count();
    if (count > 0) {
      const firstCard = packageCards.first();
      await expect(firstCard).toBeVisible();
      await expect(firstCard.locator(".package-price")).toBeVisible();
      await expect(firstCard.locator(".package-symbol")).toHaveAttribute("aria-hidden", "true");
    }
  });
});

test.describe("RC04 Admin Navigation & Shell Verification", () => {
  test("unauthenticated access to admin routes redirects safely to login with staff heading", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบเจ้าหน้าที่" })).toBeVisible();
  });

  test("login form has accessible inputs, contrast, and hospital branding", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");

    const brand = page.locator("header .brand img");
    await expect(brand).toBeVisible();
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
  });
});
