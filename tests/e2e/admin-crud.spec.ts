import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { syntheticStaff } from "./staff-fixture";
import { hash, encrypt } from "../../src/lib/security";
const db = new PrismaClient(),
  marker = crypto.randomUUID();
let staff: Awaited<ReturnType<typeof syntheticStaff>>,
  clinician: Awaited<ReturnType<typeof syntheticStaff>>,
  dpo: Awaited<ReturnType<typeof syntheticStaff>>,
  invoiceId = "",
  privacyId = "",
  ownerId = "",
  packageId = "",
  serviceId = "";
const qIds: string[] = [];
let bookingId = "",
  bookingReference = "",
  targetSlotId = "",
  quoteId = "",
  registrationId = "",
  waitId = "";
const depId = "ui_" + marker.replace(/[^a-f]/g, "").slice(0, 10);
const rescheduleDay =
  "2093-" +
  String(Math.floor(Math.random() * 10) + 1).padStart(2, "0") +
  "-" +
  String(Math.floor(Math.random() * 20) + 1).padStart(2, "0");
const day =
  "2094-" +
  String(Math.floor(Math.random() * 10) + 1).padStart(2, "0") +
  "-" +
  String(Math.floor(Math.random() * 20) + 1).padStart(2, "0");
async function auth(context: BrowserContext, userId: string) {
  const token = crypto.randomUUID();
  await db.session.create({
    data: {
      userId,
      tokenHash: hash(token),
      stage: "full",
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
async function edit(page: Page, text: string) {
  await page
    .locator("article")
    .filter({ hasText: text })
    .getByRole("button", { name: /ดูรายละเอียด/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return page.getByRole("dialog");
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test.beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("isolated test DB required");
  staff = await syntheticStaff("superadmin");
  clinician = await syntheticStaff("clinician");
  dpo = await syntheticStaff("dpo");
  ownerId = (
    await db.session.create({
      data: {
        tokenHash: hash(marker),
        expiresAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  invoiceId = (
    await db.invoice.create({
      data: { bookingId: "browser-" + marker, estimatedAmount: "100" },
    })
  ).id;
  privacyId = (
    await db.privacyRequest.create({
      data: { sessionId: ownerId, type: "correction" },
    })
  ).id;
  const svc = await db.service.create({
    data: {
      code: "B-" + marker,
      nameTh: "Synthetic source " + marker,
      nameEn: "Test",
      category: "test",
      unit: "ครั้ง",
      componentCodes: [],
    },
  });
  serviceId = svc.id;
  await db.price.create({
    data: {
      serviceId,
      amount: "100",
      version: 1,
      effectiveFrom: new Date(Date.now() - 86400000),
      approvedBy: staff.id,
    },
  });
  packageId = (
    await db.package.create({
      data: {
        key: "B-" + marker,
        version: 1,
        name: "Synthetic package " + marker,
        description: "Synthetic description",
        audience: "Synthetic audience",
        fixedPrice: "100",
        preparation: "Synthetic preparation",
        effectiveFrom: new Date(Date.now() - 86400000),
        items: { create: { serviceId, position: 0 } },
      },
    })
  ).id;
  await db.dayCapacity.create({ data: { id: rescheduleDay, capacity: 5 } });
  const original = await db.slot.create({
    data: {
      dayId: rescheduleDay,
      startsAt: new Date(rescheduleDay + "T09:00:00+07:00"),
      endsAt: new Date(rescheduleDay + "T10:00:00+07:00"),
      capacity: 1,
    },
  });
  targetSlotId = (
    await db.slot.create({
      data: {
        dayId: rescheduleDay,
        startsAt: new Date(rescheduleDay + "T11:00:00+07:00"),
        endsAt: new Date(rescheduleDay + "T12:00:00+07:00"),
        capacity: 1,
      },
    })
  ).id;
  registrationId = (
    await db.registration.create({
      data: {
        ownerSessionId: ownerId,
        draftEncrypted: encrypt({
          firstName: "Synthetic",
          lastName: "Browser",
          phone: "synthetic contact",
        }),
        expiresAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  quoteId = (
    await db.quote.create({
      data: {
        sessionId: ownerId,
        packageId,
        snapshot: {},
        fingerprint: hash(marker),
        total: "100",
        expiresAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  bookingReference = "BROWSER-" + marker.slice(0, 20);
  bookingId = (
    await db.booking.create({
      data: {
        reference: bookingReference,
        registrationId,
        sessionId: ownerId,
        slotId: original.id,
        quoteId,
        idempotencyKey: marker,
        requestHash: hash(marker),
        checkInTokenHash: hash("check" + marker),
        checkInTokenEncrypted: encrypt("synthetic"),
      },
    })
  ).id;
  waitId = (
    await db.waitlist.create({
      data: { sessionId: ownerId, dayId: rescheduleDay },
    })
  ).id;
});
test.afterAll(async () => {
  const changes = await db.bookingChange.findMany({
    where: { bookingId },
    select: { id: true },
  });
  await db.notification.deleteMany({
    where: { dedupKey: { in: changes.map((c) => c.id) } },
  });
  await db.bookingChange.deleteMany({ where: { bookingId } });
  await db.waitlist.deleteMany({ where: { id: waitId } });
  await db.booking.deleteMany({ where: { id: bookingId } });
  await db.quote.deleteMany({ where: { id: quoteId } });
  await db.registration.deleteMany({ where: { id: registrationId } });
  await db.slot.deleteMany({ where: { dayId: rescheduleDay } });
  await db.dayCapacity.deleteMany({ where: { id: rescheduleDay } });
  await db.chatDepartment.deleteMany({ where: { id: depId } });
  await db.financeEntry.deleteMany({ where: { invoiceId } });
  await db.invoice.deleteMany({ where: { id: invoiceId } });
  await db.privacyCaseEvent.deleteMany({ where: { requestId: privacyId } });
  await db.privacyRequest.deleteMany({ where: { id: privacyId } });
  await db.organization.deleteMany({ where: { name: { contains: marker } } });
  await db.packageItem.deleteMany({
    where: { package: { key: "B-" + marker } },
  });
  await db.package.deleteMany({ where: { key: "B-" + marker } });
  const svcs = await db.service.findMany({
    where: { code: { contains: marker } },
    select: { id: true },
  });
  await db.price.deleteMany({
    where: { serviceId: { in: svcs.map((s) => s.id) } },
  });
  await db.service.deleteMany({ where: { id: { in: svcs.map((s) => s.id) } } });
  await db.slot.deleteMany({ where: { dayId: day } });
  await db.dayCapacity.deleteMany({ where: { id: day } });
  await db.questionnaire.deleteMany({ where: { id: { in: qIds } } });
  await db.session.deleteMany({ where: { id: ownerId } });
  if (staff) await staff.cleanup();
  if (clinician) await clinician.cleanup();
  if (dpo) await dpo.cleanup();
  await db.$disconnect();
});
test("organization create edit disable and mobile modal", async ({
  page,
  context,
}) => {
  await auth(context, staff.id);
  await page.goto("/admin/organizations");
  await page.getByRole("button", { name: "เพิ่มองค์กร", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("ชื่อองค์กร", { exact: true })
    .fill("Synthetic " + marker);
  await dialog
    .getByLabel("ผู้ประสานงาน / ช่องทางติดต่อ", { exact: true })
    .fill("Synthetic contact");
  await save(page);
  dialog = await edit(page, marker);
  await dialog
    .getByLabel("ชื่อองค์กร", { exact: true })
    .fill("Synthetic revised " + marker);
  await dialog.getByLabel("สถานะองค์กร").selectOption("active");
  await dialog
    .getByLabel("เหตุผล / บันทึกดำเนินการ")
    .fill("Synthetic revision");
  await save(page);
  dialog = await edit(page, marker);
  await expect(
    dialog.getByLabel("ผู้ประสานงาน / ช่องทางติดต่อ", { exact: true }),
  ).toHaveValue("Synthetic contact");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/qa/2026-10-30/admin-crud-org-390.png" });
  await dialog.getByLabel("สถานะองค์กร").selectOption("inactive");
  await dialog.getByLabel("เหตุผล / บันทึกดำเนินการ").fill("Synthetic close");
  await save(page);
  expect(
    (
      await db.organization.findFirstOrThrow({
        where: { name: { contains: marker } },
      })
    ).status,
  ).toBe("inactive");
});
test("service metadata editor and slot lifecycle", async ({
  page,
  context,
}) => {
  await auth(context, staff.id);
  await page.goto("/admin/lab-pricing");
  await page
    .getByRole("button", { name: "เพิ่มรายการตรวจ", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("รหัสบริการ", { exact: true }).fill("NEW-" + marker);
  await d
    .getByLabel("ชื่อบริการภาษาไทย", { exact: true })
    .fill("Synthetic new " + marker);
  await d
    .getByLabel("ชื่อบริการภาษาอังกฤษ", { exact: true })
    .fill("Synthetic test");
  await d.getByLabel("หมวดหมู่", { exact: true }).fill("test");
  await d.getByLabel("หน่วย", { exact: true }).fill("ครั้ง");
  await save(page);
  await page
    .getByLabel("ค้นหาในฐานข้อมูล", { exact: true })
    .fill("NEW-" + marker);
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  d = await edit(page, "NEW-" + marker);
  await d
    .getByLabel("ชื่อบริการภาษาอังกฤษ", { exact: true })
    .fill("Revised synthetic");
  await d
    .getByLabel("เหตุผล / บันทึกดำเนินการ")
    .fill("Synthetic metadata edit");
  await save(page);
  expect(
    (await db.service.findUniqueOrThrow({ where: { code: "NEW-" + marker } }))
      .nameEn,
  ).toBe("Revised synthetic");
  await page.goto("/admin/calendar");
  await page
    .getByRole("button", { name: "เพิ่มช่วงเวลา", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("วันให้บริการ", { exact: true }).fill(day);
  await d.getByLabel("เวลาเริ่มต้น (ไทย)", { exact: true }).fill("09:00");
  await d.getByLabel("ความจุรายวัน", { exact: true }).fill("10");
  await d.getByLabel("ความจุช่วงเวลา", { exact: true }).fill("5");
  await save(page);
  const slot = await db.slot.findFirstOrThrow({ where: { dayId: day } });
  await page.getByLabel("ค้นหาวัน (YYYY-MM-DD)", { exact: true }).fill(day);
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  d = await edit(page, slot.id);
  await d.getByLabel("ปิดช่วงเวลา", { exact: true }).check();
  await d.getByLabel("เหตุผล / บันทึกดำเนินการ").fill("Synthetic close slot");
  await save(page);
  expect(
    (await db.slot.findUniqueOrThrow({ where: { id: slot.id } })).closed,
  ).toBe(true);
});
test("package clone prefill and clinician read approval permission", async ({
  page,
  context,
  browser,
}) => {
  expect(packageId).toBeTruthy();
  await auth(context, staff.id);
  await page.goto("/admin/packages");
  await page
    .locator("tr")
    .filter({ hasText: "B-" + marker })
    .getByRole("button", { name: "แก้ไขโดยสร้างรุ่นใหม่" })
    .click();
  await expect(page.getByLabel("ชื่อแพ็กเกจ", { exact: true })).toHaveValue(
    "Synthetic package " + marker,
  );
  await expect(
    page.getByRole("textbox", { name: "รายละเอียด", exact: true }),
  ).toHaveValue("Synthetic description");
  await expect(page.getByText("เลือกรายการตรวจแล้ว 1 รายการ")).toBeVisible();
  await page.getByRole("button", { name: /บันทึก.*ร่าง/ }).click();
  await expect(
    page.getByText(
      "สร้างเวอร์ชันฉบับร่างแล้ว ต้องได้รับการอนุมัติก่อนแสดงในเว็บไซต์",
    ),
  ).toBeVisible();
  expect(await db.package.count({ where: { key: "B-" + marker } })).toBe(2);
  const ctx = await browser.newContext();
  try {
    await auth(ctx, clinician.id);
    const p = await ctx.newPage();
    await p.goto("/admin/packages");
    await expect(
      p.getByRole("button", { name: "อนุมัติเผยแพร่" }).first(),
    ).toBeVisible();
    await expect(
      p.getByRole("button", { name: "แก้ไขโดยสร้างรุ่นใหม่" }),
    ).toHaveCount(0);
    await expect(
      p.getByRole("link", { name: "การเงินและค่าบริการ", exact: true }),
    ).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
test("finance approval bill payment and ledger UI", async ({
  page,
  context,
}) => {
  await auth(context, staff.id);
  await page.goto("/admin/billing");
  await page.getByLabel("ค้นหาในฐานข้อมูล", { exact: true }).fill(invoiceId);
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  for (const [action, amount] of [
    ["approve", "100"],
    ["bill", "100"],
    ["payment", "30"],
  ]) {
    const d = await edit(page, invoiceId);
    await d.getByLabel("รายการดำเนินการ", { exact: true }).selectOption(action);
    await d
      .getByLabel("ยอดเงิน (ยกเลิกเอกสารให้ระบุ 0)", { exact: true })
      .fill(amount);
    await d
      .getByLabel("เลขหลักฐาน/เอกสารอ้างอิง", { exact: true })
      .fill("SYNTHETIC-ONLY");
    await d
      .getByLabel("เหตุผล / บันทึกดำเนินการ")
      .fill("Synthetic financial evidence");
    await save(page);
  }
  expect(
    (
      await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    ).paidAmount?.toFixed(2),
  ).toBe("30.00");
  const d = await edit(page, invoiceId);
  await expect(
    d.getByRole("heading", { name: "ประวัติการเงิน (ล่าสุด 100 รายการ)" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.screenshot({
    path: "docs/qa/2026-10-30/admin-crud-finance-820.png",
  });
});
test("PDPA staff workflow requires identity before processing", async ({
  page,
  context,
}) => {
  await auth(context, dpo.id);
  await page.goto("/admin/privacy");
  await expect(
    page.getByRole("heading", {
      name: "ดำเนินคำร้องข้อมูลส่วนบุคคล",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("ค้นหาในฐานข้อมูล", { exact: true }).fill(privacyId);
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  for (const [action, status] of [
    ["update", "under_review"],
    ["verify_identity", "under_review"],
    ["update", "processing"],
    ["update", "completed"],
  ]) {
    const d = await edit(page, privacyId);
    await d.getByLabel("รายการดำเนินการ", { exact: true }).selectOption(action);
    await d.getByLabel("สถานะคำร้อง", { exact: true }).selectOption(status);
    if (action === "verify_identity")
      await d
        .getByLabel("ตรวจตัวตนตามขั้นตอนของโรงพยาบาลแล้ว", { exact: true })
        .check();
    await d
      .getByLabel("เหตุผล / ผลดำเนินการ / หลักฐานตรวจตัวตน")
      .fill("Synthetic verified case evidence");
    await save(page);
  }
  expect(
    (await db.privacyRequest.findUniqueOrThrow({ where: { id: privacyId } }))
      .status,
  ).toBe("completed");
  await expect(
    page.getByRole("link", { name: "จัดการนัดหมาย", exact: true }),
  ).toHaveCount(0);
});
test("questionnaire draft edit and archive UI", async ({ page, context }) => {
  await auth(context, staff.id);
  await page.goto("/admin/questionnaires");
  const content = {
    questions: [
      { id: "synthetic", label: "Synthetic " + marker, type: "text" },
    ],
    rules: [],
  };
  await page
    .getByRole("textbox", { name: "คำถามและกฎฉบับร่าง" })
    .fill(JSON.stringify(content));
  await page
    .getByRole("button", { name: "บันทึกฉบับร่าง", exact: true })
    .click();
  await expect(
    page.getByText("บันทึกข้อมูลแล้ว", { exact: true }),
  ).toBeVisible();
  const q = await db.questionnaire.findFirstOrThrow({
    orderBy: { version: "desc" },
  });
  qIds.push(q.id);
  const article = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "แบบประเมินเวอร์ชัน " + q.version,
      exact: true,
    }),
  });
  await article
    .getByRole("button", { name: "แก้ไขฉบับร่าง", exact: true })
    .click();
  content.questions[0].label = "Synthetic revised " + marker;
  await page
    .getByRole("textbox", { name: "คำถามและกฎฉบับร่าง" })
    .fill(JSON.stringify(content));
  await page
    .getByRole("button", { name: "บันทึกฉบับร่าง", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } }))
          .revision,
    )
    .toBe(1);
  page.once("dialog", (d) => d.accept("Synthetic archive"));
  await article
    .getByRole("button", { name: "เก็บเข้าคลัง", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.questionnaire.findUniqueOrThrow({ where: { id: q.id } }))
          .status,
    )
    .toBe("archived");
});

test("staff reschedule and waitlist link actual booking", async ({
  page,
  context,
}) => {
  await auth(context, staff.id);
  await page.goto("/admin/appointments");
  await page
    .locator("tr")
    .filter({ hasText: bookingReference })
    .getByRole("button", { name: "เลื่อนนัด", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("เริ่มค้นหาวันว่าง", { exact: true }).fill(rescheduleDay);
  await expect(
    d.getByLabel("ช่วงเวลาใหม่", { exact: true }).locator("option").first(),
  ).toBeAttached();
  await d
    .getByLabel("ช่วงเวลาใหม่", { exact: true })
    .selectOption(targetSlotId);
  await d
    .getByLabel("เหตุผล / หลักฐานการตกลงวันเวลาใหม่", { exact: true })
    .fill("Synthetic agreed new time");
  await d
    .getByLabel("ผู้รับบริการตกลงวันเวลาใหม่แล้ว", { exact: true })
    .check();
  await d.getByRole("button", { name: "ยืนยันเลื่อนนัด", exact: true }).click();
  await expect(d).not.toBeVisible();
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).slotId,
  ).toBe(targetSlotId);
  await page.goto("/admin/waitlist");
  await page.getByLabel("ค้นหาในฐานข้อมูล", { exact: true }).fill(waitId);
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  for (const status of ["contacted", "scheduled", "closed"]) {
    d = await edit(page, waitId);
    await d.getByLabel("สถานะคิวรอ", { exact: true }).selectOption(status);
    await d.getByLabel("ผู้รับผิดชอบ", { exact: true }).selectOption(staff.id);
    if (status === "scheduled")
      await d
        .getByLabel("เลขนัดจริง เมื่อตั้งสถานะมีนัด", { exact: true })
        .fill(bookingReference);
    await d
      .getByLabel("เหตุผล / บันทึกดำเนินการ")
      .fill("Synthetic waitlist action");
    await save(page);
  }
  const wait = await db.waitlist.findUniqueOrThrow({ where: { id: waitId } });
  expect(wait.status).toBe("closed");
  expect(wait.bookingId).toBe(bookingId);
});
test("chat department create rename and deactivate UI", async ({
  page,
  context,
}) => {
  await auth(context, staff.id);
  await page.goto("/admin/chat/settings");
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", { name: "เพิ่มหน่วยงาน", exact: true }),
    });
  await form
    .getByLabel("รหัสหน่วยงาน (a-z และ _)", { exact: true })
    .fill(depId);
  await form
    .getByLabel("ชื่อหน่วยงาน", { exact: true })
    .fill("Synthetic browser department");
  await form
    .getByRole("button", { name: "เพิ่มหน่วยงาน", exact: true })
    .click();
  await expect(page.getByText(depId, { exact: true })).toBeVisible();
  const editForm = page
    .locator("form")
    .filter({ has: page.getByText(depId, { exact: true }) });
  await editForm
    .getByLabel("ชื่อหน่วยงาน", { exact: true })
    .fill("Synthetic revised department");
  await editForm.getByLabel("เปิดใช้งาน", { exact: true }).uncheck();
  await editForm
    .getByRole("button", { name: "บันทึกหน่วยงาน", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.chatDepartment.findUniqueOrThrow({ where: { id: depId } }))
          .active,
    )
    .toBe(false);
});
