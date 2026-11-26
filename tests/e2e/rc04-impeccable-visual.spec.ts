import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * RC04 Impeccable Visual & Accessibility Regression Tests
 * Covers Public Navigation, Brand Icons, Package Cards, Multilingual Rendering,
 * Contrast Ratios, Loading/Empty/Error States, and Viewport Matrix.
 */

const SCREENSHOT_DIR = "docs/qa/2026-11-26";

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 640 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const SYNTHETIC_PACKAGES = [
  {
    id: "pkg-rc04-basic",
    name: "โปรแกรมตรวจสุขภาพพื้นฐาน RC04",
    description: "ตรวจคัดกรองสุขภาพประจำปีสำหรับประชาชนทั่วไปและวัยทำงาน",
    audience: "วัยทำงานและบุคคลทั่วไป",
    price: "1250",
    minAge: 18,
    maxAge: 60,
    preparation: "งดน้ำและอาหารอย่างน้อย 8 ชั่วโมงก่อนเข้ารับบริการ",
    version: 1,
    items: [
      { id: "i1", code: "CBC", nameTh: "ตรวจความสมบูรณ์ของเม็ดเลือด (CBC)", mode: "included" },
      { id: "i2", code: "FBS", nameTh: "ตรวจระดับน้ำตาลในเลือด (FBS)", mode: "included" },
      { id: "i3", code: "CHOL", nameTh: "ตรวจไขมันในเลือด", mode: "included" },
    ],
  },
];

async function mockPublicPackages(page: Page, packages = SYNTHETIC_PACKAGES) {
  await page.route("**/api/v1/packages*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: packages }),
    });
  });
}

async function measureContrast(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 0;

    function parseRgb(str: string): [number, number, number, number] {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
      if (!m) return [255, 255, 255, 1];
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    }

    function effectiveBg(node: Element | null): [number, number, number] {
      let cur: Element | null = node;
      while (cur) {
        const bg = parseRgb(getComputedStyle(cur).backgroundColor);
        if (bg[3] > 0.9) return [bg[0], bg[1], bg[2]];
        cur = cur.parentElement;
      }
      return [255, 255, 255];
    }

    function luminance([r, g, b]: [number, number, number]): number {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    const fg = parseRgb(getComputedStyle(el).color);
    const bg = effectiveBg(el);
    const l1 = luminance([fg[0], fg[1], fg[2]]);
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }, selector);
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe("RC04 Public Portal, Brand Icons & Contrast Coverage", () => {
  for (const vp of VIEWPORTS) {
    test(`renders public portal on ${vp.name} (${vp.width}px) without overflow`, async ({ page }) => {
      await mockPublicPackages(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");

      await expect(page.locator("article.package-card").first()).toBeVisible();

      // Verify no horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Verify official hospital brand logo
      const brandLogo = page.locator("header .brand img");
      await expect(brandLogo).toBeVisible();
      await expect(brandLogo).toHaveAttribute("alt", /โรงพยาบาลปลวกแดง/);

      // Verify footer third-party official brand icons (LINE, Facebook)
      const footer = page.locator("footer#contact");
      await expect(footer).toBeVisible();
      await expect(footer.getByLabel("LINE Official Account")).toBeVisible();
      await expect(footer.getByLabel("Facebook Page")).toBeVisible();

      await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-public-${vp.width}.png`, fullPage: true });
    });
  }

  test("package cards have accessible labels, wrapping, contrast, and icon accessibility", async ({ page }) => {
    await mockPublicPackages(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");

    const firstCard = page.locator("article.package-card").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toHaveAttribute("aria-label", SYNTHETIC_PACKAGES[0].name);
    await expect(firstCard.locator(".package-price")).toContainText("1,250");
    await expect(firstCard.locator(".package-symbol")).toHaveAttribute("aria-hidden", "true");
    await expect(firstCard.locator(".check-list svg").first()).toHaveAttribute("aria-hidden", "true");

    // Contrast checks on key public elements
    expect(await measureContrast(page, "#packages-heading")).toBeGreaterThanOrEqual(4.5);
    expect(await measureContrast(page, ".section-intro p")).toBeGreaterThanOrEqual(4.5);
    expect(await measureContrast(page, ".campaign-section a.button")).toBeGreaterThanOrEqual(4.5);
  });

  test("Thai and multilingual (en, zh-Hans, my, km) rendering without overflow", async ({ page }) => {
    await mockPublicPackages(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const select = page.locator(".language-switcher select");
    await expect(select).toBeEnabled();

    const expectedHeadings: Record<string, string> = {
      th: "แพ็กเกจตรวจสุขภาพ โรงพยาบาลปลวกแดง",
      en: "Health check packages · Pluak Daeng Hospital",
      "zh-Hans": "Health check packages · Pluak Daeng Hospital",
      my: "Health check packages · Pluak Daeng Hospital",
      km: "Health check packages · Pluak Daeng Hospital",
    };

    for (const locale of ["th", "en", "zh-Hans", "my", "km"]) {
      await select.selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      if (locale === "th" || locale === "en") {
        await expect(page.locator("#packages-heading")).toContainText(expectedHeadings[locale]);
      } else {
        const headingText = await page.locator("#packages-heading").innerText();
        expect(headingText.trim().length).toBeGreaterThan(0);
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      );
      expect(overflow, `Overflow for locale ${locale} at 390px`).toBe(true);

      if (locale === "en" || locale === "my") {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-public-lang-${locale}-390.png`, fullPage: true });
      }
    }
  });

  test("public package list loading, empty, and error states render cleanly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Loading + empty state
    await page.route("**/api/v1/packages*", async (route) => {
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.goto("/");
    await expect(page.locator("#packages [role='status']")).toBeVisible();
    await expect(page.locator("#packages .empty")).toContainText("ยังไม่มีแพ็กเกจที่ได้รับอนุมัติ");
    await page.unroute("**/api/v1/packages*");

    // Error state
    await page.route("**/api/v1/packages*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "SYNTHETIC_PUBLIC_ERR" } }),
      });
    });
    await page.goto("/");
    await expect(page.locator("#packages .alert.error[role='alert']")).toContainText("SYNTHETIC_PUBLIC_ERR");
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
    expect(await measureContrast(page, ".login-container form button.button")).toBeGreaterThanOrEqual(4.5);
  });
});
