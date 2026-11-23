import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt, hash } from "../../src/lib/security";
import { proposeRc03Questionnaire } from "../../src/lib/rc03-questionnaire";
import { verifyRc02TestDatabase } from "../../scripts/test-db-guard.mjs";
const db = new PrismaClient(),
  marker = crypto.randomUUID();
let safe = false,
  organizationId = "",
  questionnaireId = "",
  ownerId = "";

test.beforeAll(async () => {
  await verifyRc02TestDatabase(db, process.env.DATABASE_URL ?? "");
  safe = true;
  organizationId = (
    await db.organization.create({
      data: {
        name: "RC03 Synthetic Group " + marker,
        status: "active",
        contactEncrypted: encrypt("Synthetic coordinator"),
      },
    })
  ).id;
  const latest = await db.questionnaire.findFirst({
    orderBy: { version: "desc" },
  });
  const proposal = proposeRc03Questionnaire([], []);
  questionnaireId = (
    await db.questionnaire.create({
      data: {
        version: (latest?.version ?? 0) + 1,
        ...proposal,
        status: "published",
        approvedBy: "synthetic-test-only",
      },
    })
  ).id;
});
test.afterAll(async () => {
  if (safe) {
    if (ownerId) {
      await db.contactRequest.deleteMany({ where: { sessionId: ownerId } });
      await db.registration.deleteMany({ where: { ownerSessionId: ownerId } });
      await db.verification.deleteMany({ where: { sessionId: ownerId } });
      await db.privacyRecord.deleteMany({ where: { sessionId: ownerId } });
      await db.audit.deleteMany({ where: { actorId: ownerId } });
      await db.rateLimit.deleteMany({ where: { key: { contains: ownerId } } });
      await db.session.deleteMany({ where: { id: ownerId } });
    }
    if (questionnaireId)
      await db.questionnaire.deleteMany({ where: { id: questionnaireId } });
    if (organizationId)
      await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
});

test("real group registration retains clinical answers through reload and creates one contact request", async ({
  page,
  context,
}) => {
  const auth = page.waitForResponse((r) =>
    r.url().endsWith("/api/v1/auth/guest"),
  );
  await page.goto("/register");
  const guest = (await (await auth).json()).data;
  await page
    .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล", exact: true })
    .click();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "pdh_session",
  )!;
  ownerId = (
    await db.session.findUniqueOrThrow({
      where: { tokenHash: hash(cookie.value) },
    })
  ).id;
  await page.locator("#firstName").fill("Synthetic group");
  await page.locator("#lastName").fill(marker);
  await page.getByLabel("วันเกิด (ค.ศ.) *", { exact: true }).fill("1991-11-24");
  await page.locator("#heightCm").fill("170");
  await page.locator("#weightKg").fill("70");
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("unknown");
  await page.getByLabel("โทรศัพท์มือถือ *", { exact: true }).fill("0815556677");
  await page.getByRole("radio", { name: "หน่วยงาน / กลุ่ม", exact: true }).check();
  await page
    .getByLabel("หน่วยงาน *", { exact: true })
    .selectOption(organizationId);
  await page
    .getByLabel("ผู้ประสานงานหลัก *", { exact: true })
    .fill("Synthetic coordinator");
  await page
    .getByLabel("โทรศัพท์ผู้ประสานงาน *", { exact: true })
    .fill("0815556677");
  if (guest.otpRequired && !guest.verified) {
    const otp = page.waitForResponse((r) =>
      r.url().endsWith("/api/v1/otp/request"),
    );
    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
    const code = (await (await otp).json()).data.testCode;
    expect(code).toMatch(/^\d{6}$/);
    await page.getByLabel("รหัส OTP", { exact: true }).fill(code);
  }
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "2. ประเมินสุขภาพ" }),
  ).toBeVisible();
  for (const field of [
    "medicalHistory",
    "currentMedication",
    "allergies",
    "surgeryHistory",
  ])
    await page.locator("#" + field).selectOption("none");
  await page.locator("#familyNcdStatus").selectOption("unknown");
  await page.locator("#q-snoring_history").selectOption("yes");
  const savedResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/registrations") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  const saved = await savedResponse;
  expect(saved.ok()).toBe(true);
  const id = (await saved.json()).data.id;
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล", exact: true })
    .click();
  await expect(page.locator("#weightKg")).toHaveValue("70");
  await expect(page.getByLabel("หน่วยงาน *", { exact: true })).toHaveValue(
    organizationId,
  );
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(page.locator("#q-snoring_history")).toHaveValue("yes");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "6. ตรวจสอบและยืนยัน" }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  const submitted = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/contact-requests") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับ", exact: true })
    .click();
  expect((await submitted).ok()).toBe(true);
  expect(
    await db.registration.count({ where: { ownerSessionId: ownerId } }),
  ).toBe(1);
  expect(await db.contactRequest.count({ where: { registrationId: id } })).toBe(
    1,
  );
  expect(await db.booking.count({ where: { registrationId: id } })).toBe(0);
  const registration = await db.registration.findUniqueOrThrow({
    where: { id },
  });
  expect(registration.organizationId).toBe(organizationId);
  expect(decrypt(registration.draftEncrypted)).toMatchObject({
    heightCm: 170,
    weightKg: 70,
    registrationMode: "group",
  });
  expect(decrypt(registration.assessmentEncrypted!)).toMatchObject({
    snoring_history: "yes",
  });
});
