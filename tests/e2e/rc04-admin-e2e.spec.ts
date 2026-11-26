import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";
import { syntheticStaff } from "./staff-fixture";
import { encrypt, hash } from "../../src/lib/security";
import { verifyRc02TestDatabase } from "../../scripts/test-db-guard.mjs";

const db = new PrismaClient();
const marker = crypto.randomUUID();
const contactReference = "RC04-UI-" + marker.slice(0, 12);
const orgName = "RC04 Synthetic Org " + marker.slice(0, 8);
const SCREENSHOT_DIR = "docs/qa/2026-11-26";

const VIEWPORTS = [
  { name: "320", width: 320, height: 640 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];

let verifiedDatabase = false;
let staff: Awaited<ReturnType<typeof syntheticStaff>> | undefined;
let regStaff: Awaited<ReturnType<typeof syntheticStaff>> | undefined;
let onboardingStaffId = "";
let ownerSessionId = "";
let registrationId = "";
let contactId = "";
let orgId = "";

async function auth(
  context: BrowserContext,
  userId: string,
  stage: "full" | "mfa" = "full",
) {
  const token = crypto.randomUUID();
  await db.session.create({
    data: {
      userId,
      tokenHash: hash(token),
      stage,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await context.addCookies([
    {
      name: "pdh_session",
      value: token,
      url: "http://localhost:3037",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function measureContrastRatio(page: Page, selector: string): Promise<number> {
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

    const fgRaw = parseRgb(getComputedStyle(el).color);
    const bg = effectiveBg(el);
    const l1 = luminance([fgRaw[0], fgRaw[1], fgRaw[2]]);
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }, selector);
}

test.beforeAll(async () => {
  await verifyRc02TestDatabase(db, process.env.DATABASE_URL ?? "");
  verifiedDatabase = true;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  staff = await syntheticStaff("superadmin");
  regStaff = await syntheticStaff("registration");
  onboardingStaffId = (
    await db.user.create({
      data: {
        email: `rc04-onboard-${marker}@browser-staff.invalid`,
        name: "RC04 Onboarding Staff",
        role: "superadmin",
        passwordHash: staff.passwordHash,
        mfaSecret: null,
      },
    })
  ).id;

  ownerSessionId = (
    await db.session.create({
      data: {
        tokenHash: hash(marker),
        expiresAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;

  registrationId = (
    await db.registration.create({
      data: {
        ownerSessionId,
        draftEncrypted: encrypt({
          firstName: "RC04Synthetic",
          phone: "+66812345678",
        }),
        expiresAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;

  contactId = (
    await db.contactRequest.create({
      data: {
        registrationId,
        sessionId: ownerSessionId,
        reference: contactReference,
        status: "submitted",
        payloadEncrypted: encrypt({
          person: {
            firstName: "RC04SyntheticPatient",
            lastName: marker.slice(0, 8),
            phone: "+66812345678",
            heightCm: 168,
            weightKg: 65,
            sex: "female",
            birthdate: "1990-05-15",
            treatmentRight: "self_pay",
          },
          answers: { snoring_history: "unknown" },
          questionnaireVersion: 1,
        }),
      },
    })
  ).id;

  orgId = (
    await db.organization.create({
      data: {
        name: orgName,
        contactEncrypted: encrypt("0810000000"),
        status: "active",
      },
    })
  ).id;
});

test.afterAll(async () => {
  if (verifiedDatabase) {
    const resourceIds = [contactId, orgId].filter(Boolean);
    if (resourceIds.length > 0) {
      await db.audit.deleteMany({ where: { resourceId: { in: resourceIds } } });
    }
    if (contactId) await db.contactRequest.deleteMany({ where: { id: contactId } });
    if (registrationId) await db.registration.deleteMany({ where: { id: registrationId } });
    if (ownerSessionId) await db.session.deleteMany({ where: { id: ownerSessionId } });
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
    await staff?.cleanup(onboardingStaffId ? [onboardingStaffId] : []);
    await regStaff?.cleanup();
  }
  await db.$disconnect();
});

test.describe("RC04 Authenticated Admin Navigation, Sidebar & Responsive Drawer", () => {
  test("desktop sidebar renders 4 categories, highlights active route, and preserves icon accessibility", async ({
    page,
    context,
  }) => {
    await auth(context, staff!.id);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/dashboard");

    const sidebar = page.locator("aside.sidebar");
    await expect(sidebar).toBeVisible();

    const categories = [
      "ภาพรวมและสื่อสาร",
      "บริการและคลินิก",
      "การเงินและองค์กร",
      "ความปลอดภัยและระบบ",
    ];
    for (const category of categories) {
      await expect(sidebar.getByRole("navigation", { name: category })).toBeVisible();
    }

    const dashLink = sidebar.getByRole("link", { name: "ภาพรวมระบบ", exact: true });
    const contactLink = sidebar.getByRole("link", { name: "คำขอให้ติดต่อนัด", exact: true });
    await expect(dashLink).toHaveClass(/\bactive\b/);
    await expect(dashLink).toHaveAttribute("aria-current", "page");
    await expect(contactLink).not.toHaveClass(/\bactive\b/);

    const activeContrast = await measureContrastRatio(page, "aside.sidebar nav a.active");
    expect(activeContrast).toBeGreaterThanOrEqual(4.5);

    const missingAriaHidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll("aside.sidebar nav a svg, .admin-topbar button svg"))
        .filter((svg) => svg.getAttribute("aria-hidden") !== "true")
        .length,
    );
    expect(missingAriaHidden).toBe(0);
    await expect(page.locator(".admin-topbar button[aria-label='ออกจากระบบ']")).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-admin-dashboard-1440.png`, fullPage: true });

    await page.setViewportSize({ width: 1024, height: 768 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-admin-dashboard-1024.png`, fullPage: true });

    await contactLink.click();
    await expect(page).toHaveURL(/\/admin\/contact-requests$/);
    await expect(sidebar.getByRole("link", { name: "คำขอให้ติดต่อนัด", exact: true })).toHaveClass(/\bactive\b/);
    await expect(sidebar.getByRole("link", { name: "คำขอให้ติดต่อนัด", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "ภาพรวมระบบ", exact: true })).not.toHaveClass(/\bactive\b/);
  });

  for (const vp of [
    { name: "320", width: 320, height: 640 },
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
  ]) {
    test(`responsive mobile drawer open/close, keyboard focus and ESC on ${vp.name}px`, async ({
      page,
      context,
    }) => {
      await auth(context, staff!.id);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/admin/dashboard");

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await expect(page.locator("aside.sidebar")).toBeHidden();

      const openButton = page.locator(".admin-topbar button[aria-label='เปิดเมนู']");
      await expect(openButton).toBeVisible();
      const btnBox = await openButton.boundingBox();
      expect(btnBox!.height).toBeGreaterThanOrEqual(44);
      expect(btnBox!.width).toBeGreaterThanOrEqual(44);

      if (vp.width === 320 || vp.width === 768) {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-admin-dashboard-${vp.name}.png`, fullPage: true });
      }

      await openButton.focus();
      await page.keyboard.press("Enter");

      const drawer = page.getByRole("dialog", { name: "เมนูเจ้าหน้าที่" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("navigation", { name: "เมนูเจ้าหน้าที่บนมือถือ" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "ภาพรวมระบบ", exact: true })).toHaveAttribute("aria-current", "page");

      if (vp.width === 390) {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-admin-drawer-390.png`, fullPage: true });
      }

      await page.keyboard.press("Tab");
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(openButton).toBeFocused();

      // Also verify opening via mobile bottom nav shortcut and closing via close button
      const bottomMenuBtn = page.locator(".mobile-bottom-nav button[aria-label='เมนูทั้งหมด']");
      await expect(bottomMenuBtn).toBeVisible();
      await bottomMenuBtn.click();
      await expect(drawer).toBeVisible();
      await drawer.getByRole("button", { name: "ปิดเมนู", exact: true }).click();
      await expect(drawer).toBeHidden();
    });
  }
});

test.describe("RC04 Dashboard Cards, Contrast & Loading/Empty/Error States", () => {
  test("dashboard KPI cards, contrast ratios, overflow matrix, and loading/empty/error states", async ({
    page,
    context,
  }) => {
    await auth(context, staff!.id);

    // 1. Real data check across all 5 viewports
    await page.goto("/admin/dashboard");
    await expect(page.locator(".metric")).toHaveCount(6);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      );
      expect(overflow, `Dashboard horizontal overflow at ${vp.width}px`).toBe(true);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await measureContrastRatio(page, ".page-header h1")).toBeGreaterThanOrEqual(4.5);
    expect(await measureContrastRatio(page, ".metric .label")).toBeGreaterThanOrEqual(4.5);
    expect(await measureContrastRatio(page, ".metric .value")).toBeGreaterThanOrEqual(4.5);
    expect(await measureContrastRatio(page, ".toolbar button.button")).toBeGreaterThanOrEqual(4.5);

    // 2. Loading + Empty state
    await page.route("**/api/v1/admin/dashboard*", async (route) => {
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            from: "2026-11-26",
            to: "2026-11-26",
            total: 0,
            checkedIn: 0,
            completed: 0,
            cancelled: 0,
            noShow: 0,
            estimated: "0",
            statuses: [],
            trend: [],
            bookings: [],
          },
        }),
      });
    });

    await page.getByRole("button", { name: "แสดงข้อมูล", exact: true }).click();
    await expect(page.locator(".loading[role='status']")).toBeVisible();
    await expect(page.getByText("ยังไม่มีรายการนัดหมายในช่วงนี้")).toBeVisible();
    await page.unroute("**/api/v1/admin/dashboard*");

    // 3. Error state
    await page.route("**/api/v1/admin/dashboard*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "SYNTHETIC_DASHBOARD_ERROR" } }),
      });
    });
    await page.getByRole("button", { name: "แสดงข้อมูล", exact: true }).click();
    await expect(page.locator(".alert.error[role='alert']")).toContainText("SYNTHETIC_DASHBOARD_ERROR");
  });
});

test.describe("RC04 Contact Requests Modal & SweetAlert2 Stacking", () => {
  test("contact requests table, audited detail modal, keyboard focus/ESC, states, and 5-viewport overflow", async ({
    page,
    context,
  }) => {
    await auth(context, staff!.id);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/contact-requests");

    await page.getByLabel("ค้นหาเลขอ้างอิง", { exact: true }).fill(contactReference);
    const listResp = page.waitForResponse(
      (r) => r.url().includes("admin/contact-requests?") && r.url().includes("search="),
    );
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    const payload = await (await listResp).json();
    expect(JSON.stringify(payload)).not.toMatch(/RC04SyntheticPatient|66812345678|snoring_history/);

    const trigger = page.getByRole("button", { name: "เปิดรายละเอียด " + contactReference, exact: true });
    await expect(trigger).toBeVisible();
    await expect(page.getByText("RC04SyntheticPatient", { exact: false })).toHaveCount(0);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `Contact requests table overflow at ${vp.width}px`,
      ).toBe(true);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("RC04SyntheticPatient");
    await expect(modal).toContainText("snoring_history");
    await page.keyboard.press("Tab");
    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-admin-contact-modal-1440.png`, fullPage: true });

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await expect(modal).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-admin-contact-modal-390.png`, fullPage: true });
    await modal.getByRole("button", { name: "ปิดรายละเอียด", exact: true }).click();
    await expect(modal).toBeHidden();

    // Detail error state check
    await page.route("**/api/v1/admin/contact-requests/detail*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "SYNTHETIC_DETAIL_ERR" } }),
      }),
    );
    await trigger.click();
    await expect(page.locator(".alert.error[role='alert']")).toContainText("ไม่สามารถเปิดรายละเอียดได้");
    await page.unroute("**/api/v1/admin/contact-requests/detail*");

    // Empty state check
    await page.getByLabel("ค้นหาเลขอ้างอิง", { exact: true }).fill("NONEXISTENT-" + marker);
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await expect(page.getByText("ไม่มีคำขอในสถานะนี้")).toBeVisible();
  });

  for (const vp of [
    { name: "1440", width: 1440, height: 900 },
    { name: "390", width: 390, height: 844 },
  ]) {
    test(`SweetAlert2 confirmation stacks interactively above Radix Dialog on ${vp.name}px`, async ({
      page,
      context,
    }) => {
      await auth(context, staff!.id);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/admin/organizations");

      await page.getByLabel("ค้นหาในฐานข้อมูล", { exact: true }).fill(orgName);
      await page.getByRole("button", { name: "ค้นหา", exact: true }).click();

      await page
        .locator("article")
        .filter({ hasText: orgName })
        .getByRole("button", { name: /ดูรายละเอียด/ })
        .click();

      const editor = page.getByRole("dialog").filter({ has: page.locator("form") });
      await expect(editor).toBeVisible();

      await editor.getByLabel("สถานะองค์กร").selectOption("inactive");
      await editor.getByLabel("เหตุผล / บันทึกดำเนินการ").fill("RC04 SweetAlert stacking verification");
      await editor.getByRole("button", { name: "บันทึก", exact: true }).click();

      const swalPopup = page.locator(".swal2-popup.swal2-show");
      await expect(swalPopup).toBeVisible();
      await expect(swalPopup).toContainText("ยืนยันปิดใช้งานรายการนี้");

      const stacking = await page.evaluate(() => {
        const swal = document.querySelector(".swal2-container");
        const modal = document.querySelector(".modal");
        if (!swal || !modal) return null;
        const swalStyle = getComputedStyle(swal);
        const modalStyle = getComputedStyle(modal);
        return {
          swalZ: Number(swalStyle.zIndex),
          modalZ: Number(modalStyle.zIndex),
          swalPointerEvents: swalStyle.pointerEvents,
        };
      });
      expect(stacking).not.toBeNull();
      expect(stacking!.swalZ).toBeGreaterThan(stacking!.modalZ);
      expect(stacking!.swalPointerEvents).toBe("auto");

      const cancelBtn = swalPopup.locator(".swal2-cancel");
      const confirmBtn = swalPopup.locator(".swal2-confirm");
      await expect(cancelBtn).toBeVisible();
      await expect(confirmBtn).toBeVisible();
      await expect
        .poll(async () => (await cancelBtn.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(44);
      await expect
        .poll(async () => (await confirmBtn.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(44);

      await page.screenshot({ path: `${SCREENSHOT_DIR}/rc04-admin-swal-stacking-${vp.name}.png`, fullPage: true });

      // Cancel SweetAlert2 keeps Radix editor intact and interactive
      await cancelBtn.click();
      await expect(swalPopup).toBeHidden();
      await expect(editor).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(editor).toBeHidden();
    });
  }
});

test.describe("RC04 Security, MFA & RBAC Regression", () => {
  test("preserves unauthenticated redirect, pending-MFA gate, and role-based sidebar filtering", async ({
    page,
    context,
  }) => {
    // 1. Unauthenticated redirect
    await page.goto("/admin/contact-requests");
    await expect(page).toHaveURL(/\/login$/);

    // 2. Non-full MFA session cannot access admin APIs or admin workspace
    await auth(context, staff!.id, "mfa");
    const apiRes = await page.request.get("http://localhost:3037/api/v1/admin/dashboard");
    expect([401, 403]).toContain(apiRes.status());

    await context.clearCookies();
    await auth(context, onboardingStaffId, "mfa");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/auth\/mfa\/setup$/);

    // 3. Registration role RBAC hides superadmin/finance sections
    await context.clearCookies();
    await auth(context, regStaff!.id, "full");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/appointments");

    const sidebar = page.locator("aside.sidebar");
    await expect(sidebar.getByRole("link", { name: "จัดการนัดหมาย", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "จัดการผู้ใช้งาน", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "การเงินและค่าบริการ", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "แบบประเมินและกฎ", exact: true })).toHaveCount(0);
  });
});
