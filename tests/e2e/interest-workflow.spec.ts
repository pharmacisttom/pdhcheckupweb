import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encrypt, hash } from "../../src/lib/security";
import fs from "node:fs";
const testUrl = new URL(process.env.DATABASE_URL ?? "mysql://invalid/invalid");
const isolatedTest =
  ["localhost", "127.0.0.1"].includes(testUrl.hostname) &&
  testUrl.pathname === "/pdh_healthcheck_test";
test.skip(
  !isolatedTest,
  "Requires playwright.interest.config.ts and the isolated test database",
);
const db = new PrismaClient();
const marker = "browser-" + crypto.randomUUID();
const qv = Math.floor(Date.now() / 1000) + 1000;
let packageId: string, slotId: string, dayId: string, userId: string;
let original: { onlineEnabled: boolean; message: string };
const staffToken = crypto.randomUUID();
const phone = "081" + String(Date.now()).slice(-7);
const folder = "docs/qa/2026-10-28";
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname != "/pdh_healthcheck_test"
  )
    throw Error("Test DB required");
  fs.mkdirSync(folder, { recursive: true });
  original = await db.bookingPolicy.findUniqueOrThrow({
    where: { id: "default" },
  });
  await db.bookingPolicy.update({
    where: { id: "default" },
    data: { onlineEnabled: true },
  });
  userId = (
    await db.user.create({
      data: {
        email: marker + "@example.test",
        name: marker,
        passwordHash: "not-a-password",
        role: "superadmin",
        mfaSecret: encrypt("SYNTHETIC"),
      },
    })
  ).id;
  await db.session.create({
    data: {
      userId,
      tokenHash: hash(staffToken),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await db.questionnaire.create({
    data: {
      version: qv,
      status: "published",
      approvedBy: userId,
      questions: [
        {
          id: "review",
          label: "ต้องการให้เจ้าหน้าที่ทบทวนหรือไม่",
          translations: {
            en: {
              label: "Staff review requested?",
              options: { yes: "Yes", no: "No" },
            },
          },
          type: "single",
          options: ["yes", "no"],
          required: true,
        },
      ],
      rules: [
        {
          id: "review",
          field: "review",
          equals: "yes",
          decision: "needs_clinical_review",
          reason: "Synthetic staff review",
        },
      ],
    },
  });
  packageId = (
    await db.package.create({
      data: {
        key: marker,
        version: 1,
        name: marker,
        description: "Synthetic test only",
        audience: "Test",
        fixedPrice: "100.00",
        preparation: "Synthetic preparation only",
        status: "published",
        approvedBy: userId,
        effectiveFrom: new Date("2020-01-01"),
      },
    })
  ).id;
  const when = new Date(Date.now() + 17 * 86400000);
  dayId = when.toISOString().slice(0, 10);
  await db.dayCapacity.create({ data: { id: dayId, capacity: 3 } });
  slotId = (
    await db.slot.create({
      data: {
        dayId,
        startsAt: when,
        endsAt: new Date(when.getTime() + 3600000),
        capacity: 3,
      },
    })
  ).id;
});
test.afterAll(async () => {
  const regs = await db.registration.findMany({
    where: { draftEncrypted: { not: "" }, questionnaireVersion: qv },
  });
  const ids = regs.map((r) => r.id);
  const requests = await db.contactRequest.findMany({
    where: { registrationId: { in: ids } },
  });
  const bookings = await db.booking.findMany({
    where: { registrationId: { in: ids } },
  });
  const bIds = bookings.map((b) => b.id),
    sIds = regs.map((r) => r.ownerSessionId);
  await db.invoice.deleteMany({ where: { bookingId: { in: bIds } } });
  await db.notification.deleteMany({
    where: { dedupKey: { in: bIds.map((id) => id + ":confirmed") } },
  });
  await db.booking.deleteMany({ where: { id: { in: bIds } } });
  await db.contactRequest.deleteMany({
    where: { id: { in: requests.map((r) => r.id) } },
  });
  await db.registration.deleteMany({ where: { id: { in: ids } } });
  await db.patient.deleteMany({
    where: {
      id: { in: regs.flatMap((r) => (r.patientId ? [r.patientId] : [])) },
    },
  });
  await db.quote.deleteMany({ where: { sessionId: { in: sIds } } });
  await db.hold.deleteMany({ where: { sessionId: { in: sIds } } });
  await db.verification.deleteMany({ where: { sessionId: { in: sIds } } });
  await db.privacyRecord.deleteMany({ where: { sessionId: { in: sIds } } });
  await db.audit.deleteMany({
    where: {
      OR: [
        { actorId: userId },
        { actorId: { in: sIds } },
        { resourceId: { in: requests.map((r) => r.id) } },
      ],
    },
  });
  await db.session.deleteMany({
    where: { OR: [{ userId }, { id: { in: sIds } }] },
  });
  if (userId) await db.user.delete({ where: { id: userId } });
  if (slotId) await db.slot.delete({ where: { id: slotId } });
  if (dayId) await db.dayCapacity.delete({ where: { id: dayId } });
  if (packageId) await db.package.delete({ where: { id: packageId } });
  await db.questionnaire.deleteMany({ where: { version: qv } });
  if (original)
    await db.bookingPolicy.update({
      where: { id: "default" },
      data: {
        onlineEnabled: original.onlineEnabled,
        message: original.message,
      },
    });
  await db.$disconnect();
});
async function overflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
for (const width of [360, 390, 430, 768, 820, 1024, 1280])
  test("responsive emulation " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("#packages-heading")).toBeVisible();
    await overflow(page);
    if (width <= 800) {
      await expect(page.locator(".mobile-bottom-nav a")).toHaveCount(3);
      for (const link of await page.locator(".mobile-bottom-nav a").all()) {
        const b = await link.boundingBox();
        expect(b!.height).toBeGreaterThanOrEqual(44);
        expect(b!.width).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({
      path: folder + "/home-" + width + ".png",
      fullPage: true,
    });
    await page.goto("/register");
    await page
      .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" })
      .click();
    await expect(page.locator("#firstName")).toBeVisible();
    await overflow(page);
    await page.screenshot({
      path: folder + "/register-" + width + ".png",
      fullPage: true,
    });
  });
for (const [width, height] of [
  [768, 360],
  [1024, 768],
  [1180, 820],
  [1280, 800],
])
  test("landscape emulation " + width + "x" + height, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/register");
    await page
      .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" })
      .click();
    await page.locator("#firstName").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#lastName")).toBeFocused();
    await overflow(page);
    await page.screenshot({
      path: folder + "/landscape-" + width + "x" + height + ".png",
      fullPage: true,
    });
  });
for (const locale of ["en", "zh-Hans", "my", "km"])
  test("language rendering " + locale, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/register");
    await page
      .locator(".public-header .language-switcher select")
      .selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.locator(".registration-container .card button").click();
    await page.locator("#firstName").fill("Synthetic");
    await page
      .locator(".public-header .language-switcher select")
      .selectOption("th");
    await expect(page.locator("#firstName")).toHaveValue("Synthetic");
    await page
      .locator(".public-header .language-switcher select")
      .selectOption(locale);
    await page.evaluate(async () => {
      await document.fonts.ready;
      return true;
    });
    await overflow(page);
    await page.screenshot({
      path: folder + "/language-" + locale + "-390.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 820, height: 1180 });
    await overflow(page);
    await page.screenshot({
      path: folder + "/language-" + locale + "-820.png",
      fullPage: true,
    });
  });
test("real interest without package -> staff review -> owner acceptance -> actual Booking, plus old online flow", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" }).click();
  await page.locator("#firstName").fill("Synthetic");
  await page.locator("#lastName").fill(marker);
  await page.locator("#birthdate").fill("1990-01-01");
  await page.locator("#sex").selectOption("female");
  await page.locator("#treatmentRight").selectOption("unknown");
  await page.locator("#phone").fill(phone);
  await page.getByRole("button", { name: "ขอรหัส OTP", exact: true }).click();
  const otpText = await page
    .getByText("โหมดทดสอบ:", { exact: false })
    .innerText();
  const otp = otpText.match(/\d{6}/)![0];
  await page
    .locator(".public-header .language-switcher select")
    .selectOption("en");
  await expect(page.getByText("Test mode:", { exact: false })).toBeVisible();
  await page
    .locator(".public-header .language-switcher select")
    .selectOption("th");
  await page.locator('input[inputmode="numeric"]').fill(otp);
  await page.getByRole("button", { name: "ยืนยันรหัส", exact: true }).click();
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page.locator("#medicalHistory").fill("None");
  await page.locator("#currentMedication").fill("None");
  await page.locator("#allergies").fill("Unknown");
  await page.locator("#familyNcdStatus").selectOption("yes");
  await page
    .getByRole("button", { name: "เพิ่มประวัติญาติสายตรง", exact: true })
    .click();
  await page
    .locator('select[name="familyNcdEntries.0.relationship"]')
    .selectOption("mother");
  await page
    .locator('select[name="familyNcdEntries.0.disease"]')
    .selectOption("diabetes");
  await page
    .getByRole("button", { name: "เพิ่มประวัติญาติสายตรง", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ลบรายการญาติ", exact: true })
    .last()
    .click();
  await page.locator('textarea[name="surgeryHistory"]').fill("None");
  await page.locator("#q-review").selectOption("yes");
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page.locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", {
      name: "ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับ",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "ส่งข้อมูลให้เจ้าหน้าที่แล้ว" }),
  ).toBeVisible();
  await page.screenshot({
    path: folder + "/interest-submitted-390.png",
    fullPage: true,
  });
  const reference = await page
    .locator(".registration-container .card h2")
    .innerText();
  const staff = await browser.newContext({
    viewport: { width: 820, height: 1180 },
  });
  await staff.addCookies([
    { name: "pdh_session", value: staffToken, url: "http://localhost:3037" },
  ]);
  const staffPage = await staff.newPage();
  await staffPage.goto("/admin/contact-requests");
  const card = staffPage.locator("article").filter({
    has: staffPage.getByRole("heading", { name: reference, exact: true }),
  });
  await expect(card.getByText("None", { exact: true }).first()).toBeVisible();
  await card.locator('select[name="status"]').selectOption("under_review");
  await card.getByRole("button", { name: "บันทึกผลการติดต่อ" }).click();
  await expect(
    card.getByText("กำลังตรวจ", { exact: false }).first(),
  ).toBeVisible();
  await card.locator('select[name="status"]').selectOption("ready_to_schedule");
  await card
    .locator('textarea[name="dataReview"]')
    .fill("Staff reviewed synthetic intake");
  await card
    .locator('select[name="entitlementStatus"]')
    .selectOption("unable_to_verify");
  await card
    .locator('textarea[name="entitlementReview"]')
    .fill("Synthetic coverage review; self-pay discussed");
  await card.getByRole("button", { name: "บันทึกผลการติดต่อ" }).click();
  await card.locator('select[name="packageId"]').selectOption(packageId);
  await card.getByRole("button", { name: "เสนอราคาให้ผู้ใช้รับทราบ" }).click();
  await expect(
    card.getByText("รอผู้ใช้รับทราบในหน้ารายการของฉัน ราคามีอายุ 15 นาที"),
  ).toBeVisible();
  await staffPage.screenshot({
    path: folder + "/staff-review-820.png",
    fullPage: true,
  });
  await page.goto("/bookings");
  const ownCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: reference, exact: true }),
  });
  await ownCard.locator('select[name="slotId"]').focus();
  await expect(ownCard.locator('option[value="' + slotId + '"]')).toHaveCount(
    1,
  );
  await ownCard.locator('select[name="slotId"]').selectOption(slotId);
  await ownCard.locator('input[type="checkbox"]').check();
  await ownCard.getByRole("button", { name: "รับทราบและตกลงวันเวลา" }).click();
  await expect(ownCard.getByRole("status")).toBeVisible();
  await staffPage.reload();
  await staffPage
    .locator("article")
    .filter({
      has: staffPage.getByRole("heading", { name: reference, exact: true }),
    })
    .getByRole("button", { name: "สร้าง Booking จริงและตรวจความจุ" })
    .click();
  await expect(staffPage.getByText("Booking:", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator(".booking-card")).toHaveCount(1);
  await expect(page.locator(".booking-card img")).toBeVisible();
  await page.screenshot({
    path: folder + "/confirmed-booking-390.png",
    fullPage: true,
  });
  // Existing online API flow through the same authenticated browser and genuine DB capacity service.
  const api = page.request;
  const registered = await api.post("/api/v1/registrations", {
    headers: { Origin: "http://localhost:3037" },
    data: {
      person: {
        firstName: "Second",
        lastName: marker,
        birthdate: "1991-01-01",
        phone,
      },
      answers: { review: "no" },
      questionnaireVersion: qv,
    },
  });
  expect(registered.ok()).toBe(true);
  await page.goto("/register");
  await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" }).click();
  await expect(page.locator("#firstName")).toHaveValue("Second");
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("unknown");
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page.locator("#medicalHistory").fill("None");
  await page.locator("#currentMedication").fill("None");
  await page.locator("#allergies").fill("Unknown");
  await page.locator("#familyNcdStatus").selectOption("unknown");
  await page.locator('textarea[name="surgeryHistory"]').fill("None");
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page
    .locator(".package-card")
    .filter({ has: page.getByRole("heading", { name: marker, exact: true }) })
    .getByRole("button", { name: "เลือกแพ็กเกจ", exact: true })
    .click();
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page.locator("#appointment-day").selectOption(dayId);
  await page.locator(".slot").first().click();
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await page.locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: "ยืนยันการนัดหมาย", exact: true })
    .click();
  await expect(page.locator(".booking-card")).toHaveCount(2);
  await page.screenshot({
    path: folder + "/online-booking-390.png",
    fullPage: true,
  });
  const bookings = await db.booking.findMany({
    where: { registration: { questionnaireVersion: qv } },
    orderBy: { createdAt: "desc" },
  });
  const recovered = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const recoveryPage = await recovered.newPage();
  await recoveryPage.goto("/bookings");
  await recoveryPage
    .getByText("กลับมาติดตามรายการจากอุปกรณ์อื่น / เซสชันหมดอายุ", {
      exact: true,
    })
    .click();
  await recoveryPage
    .getByLabel("เบอร์โทรที่ลงทะเบียน", { exact: true })
    .fill(phone);
  await recoveryPage
    .getByRole("button", { name: "ขอรหัส OTP", exact: true })
    .click();
  const recoveryOtp = (
    await recoveryPage.getByText("โหมดทดสอบ:", { exact: false }).innerText()
  ).match(/\d{6}/)![0];
  await recoveryPage.getByLabel("รหัส OTP", { exact: true }).fill(recoveryOtp);
  await recoveryPage
    .getByLabel("เลขติดตาม", { exact: true })
    .fill(bookings[0].reference);
  await recoveryPage
    .getByLabel("วันเกิด (ค.ศ.)", { exact: true })
    .fill("1991-01-01");
  await recoveryPage
    .getByRole("button", { name: "ยืนยันตัวตนและเรียกดูรายการ", exact: true })
    .click();
  await expect(recoveryPage.locator(".booking-card")).toHaveCount(1);
  await expect(
    recoveryPage.getByRole("heading", {
      name: bookings[0].reference,
      exact: true,
    }),
  ).toBeVisible();
  await recoveryPage.screenshot({
    path: folder + "/recovered-booking-390.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".booking-card")).toHaveCount(1);
  await recovered.close();
  await staff.close();
});
