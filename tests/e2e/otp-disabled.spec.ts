import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import { decrypt } from "../../src/lib/security";
const isolatedUrl = new URL(
  process.env.DATABASE_URL ?? "mysql://invalid/invalid",
);
test.skip(
  !["localhost", "127.0.0.1"].includes(isolatedUrl.hostname) ||
    isolatedUrl.pathname !== "/pdh_healthcheck_test" ||
    process.env.OTP_PROVIDER !== "disabled",
  "Requires playwright.no-otp.config.ts and an isolated test database",
);
const db = new PrismaClient(),
  marker = "no-otp-" + crypto.randomUUID(),
  qv = Math.floor(Date.now() / 1000) + 5000;
let original: { onlineEnabled: boolean; message: string };
test.beforeAll(async () => {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.pathname != "/pdh_healthcheck_test" ||
    process.env.OTP_PROVIDER !== "disabled"
  )
    throw Error("Isolated disabled-OTP config required");
  original = await db.bookingPolicy.findUniqueOrThrow({
    where: { id: "default" },
  });
  await db.bookingPolicy.update({
    where: { id: "default" },
    data: { onlineEnabled: false },
  });
  await db.questionnaire.create({
    data: {
      version: qv,
      status: "published",
      approvedBy: marker,
      questions: [
        { id: "allergy", label: "ประวัติแพ้ยา (ถ้ามี)", type: "text" },
        {
          id: "other",
          label: "โรคประจำตัวหรือข้อมูลอื่นที่ต้องการแจ้ง",
          type: "text",
        },
        {
          id: "medication",
          label: "มียาที่ใช้ประจำหรือไม่",
          type: "single",
          options: ["ไม่มี", "มี", "ไม่ทราบ"],
        },
        {
          id: "medication_details",
          label: "ยาที่ใช้ประจำ",
          type: "text",
          required: true,
          showIf: { field: "medication", equals: "มี" },
        },
        {
          id: "family",
          label: "ประวัติโรคไม่ติดต่อในญาติสายตรง",
          type: "multiple",
          options: [
            "เบาหวาน",
            "ความดันโลหิตสูง",
            "โรคหัวใจ",
            "ไม่มี",
            "ไม่ทราบ",
          ],
        },
        {
          id: "extra_text",
          label: "ข้อมูลอื่นที่ต้องการแจ้ง",
          type: "text",
          required: false,
          options: ["Additional category"],
        },
        {
          id: "extra_number",
          label: "Synthetic number",
          type: "numeric",
          required: false,
        },
      ],
      rules: [],
    },
  });
});
test.afterAll(async () => {
  const regs = await db.registration.findMany({
      where: { questionnaireVersion: qv },
    }),
    ids = regs.map((r) => r.id),
    sessions = regs.map((r) => r.ownerSessionId);
  await db.contactRequest.deleteMany({
    where: { registrationId: { in: ids } },
  });
  await db.registration.deleteMany({ where: { id: { in: ids } } });
  await db.privacyRecord.deleteMany({ where: { sessionId: { in: sessions } } });
  await db.audit.deleteMany({ where: { actorId: { in: sessions } } });
  await db.session.deleteMany({ where: { id: { in: sessions } } });
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
test("registration and interest submission without OTP or SMS", async ({
  page,
  browser,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.includes("/otp/")) calls.push("otp");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" }).click();
  await page.locator("#firstName").fill("NoOTP");
  await page.locator("#lastName").fill(marker);
  await page.locator("#birthdate").fill("1990-01-01");
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("self_pay");
  await page.locator("#phone").fill("0814445566");
  await expect(
    page.getByRole("button", { name: "ขอรหัส OTP", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "ยืนยันรหัส", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await expect(page.locator("#medicalHistory")).toBeVisible();
  await page.locator("#medicalHistory").selectOption("none");
  await page.locator("#currentMedication").selectOption("none");
  await page.locator("#allergies").selectOption("unknown");
  await page.locator("#familyNcdStatus").selectOption("unknown");
  await page.locator("#surgeryHistory").selectOption("none");
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
  expect(calls).toEqual([]);
  const reg = await db.registration.findFirstOrThrow({
    where: { questionnaireVersion: qv },
  });
  expect(
    (await db.session.findUniqueOrThrow({ where: { id: reg.ownerSessionId } }))
      .verifiedPhone,
  ).toBeNull();
  expect(
    await db.verification.count({ where: { sessionId: reg.ownerSessionId } }),
  ).toBe(0);
  fs.mkdirSync("docs/qa/2026-10-28", { recursive: true });
  await page.screenshot({
    path: "docs/qa/2026-10-28/otp-disabled-interest-390.png",
    fullPage: true,
  });
  await page.goto("/bookings");
  await expect(
    page.getByText("ปิดการส่ง OTP หากเปลี่ยนอุปกรณ์หรือเซสชันหมดอายุ", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ขอรหัส OTP", exact: true }),
  ).toHaveCount(0);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/bookings");
  await expect(otherPage.locator("article")).toHaveCount(0);
  await other.close();
});

test("select multiple histories, add and remove details, preserve language and legacy drafts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" }).click();
  await page.locator("#firstName").fill("History");
  await page.locator("#lastName").fill(marker);
  await page.locator("#birthdate").fill("1990-01-01");
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("unknown");
  await page.locator("#phone").fill("0814445566");
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  const medical = page.locator('[data-field="medicalHistory"]'),
    medicines = page.locator('[data-field="currentMedication"]'),
    allergies = page.locator('[data-field="allergies"]');
  await page.locator("#medicalHistory").selectOption("specified");
  await medical.getByLabel("เบาหวาน", { exact: true }).check();
  await medical.getByLabel("ความดันโลหิตสูง", { exact: true }).check();
  await medical.getByRole("button", { name: /เพิ่มรายการ/ }).click();
  await page.locator("#currentMedication").selectOption("none");
  await page.locator("#allergies").selectOption("unknown");
  await page.locator("#familyNcdStatus").selectOption("unknown");
  await page.locator("#surgeryHistory").selectOption("none");
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await expect(medical.locator(".field-error")).toBeVisible();
  await expect(page.locator("#medicalHistory")).toBeFocused();
  await page.locator("#medicalHistory-custom-0").fill("Synthetic past illness");
  await medical.getByRole("button", { name: /เพิ่มรายการ/ }).click();
  await page.locator("#medicalHistory-custom-1").fill("Remove this entry");
  await medical
    .getByRole("button", { name: /ลบรายการ/ })
    .last()
    .click();
  await expect(page.locator("#medicalHistory-custom-1")).toHaveCount(0);
  await page.locator("#currentMedication").selectOption("specified");
  await medicines.getByLabel("ยาประจำ", { exact: true }).check();
  await medicines.getByRole("button", { name: /เพิ่มรายการ/ }).click();
  await page.locator("#currentMedication-custom-0").fill("Synthetic medicine");
  await page.locator("#allergies").selectOption("specified");
  await allergies.getByLabel("แพ้ยา", { exact: true }).check();
  await allergies.getByRole("button", { name: /เพิ่มรายการ/ }).click();
  await page.locator("#allergies-custom-0").fill("Synthetic allergen");
  await page.locator("#allergies").selectOption("unknown");
  await expect(page.locator("#allergies-custom-0")).toHaveCount(0);
  await page
    .locator(".public-header .language-switcher select")
    .selectOption("en");
  await expect(page.locator("#medicalHistory-custom-0")).toHaveValue(
    "Synthetic past illness",
  );
  await expect(medical.getByLabel("Diabetes", { exact: true })).toBeChecked();
  await page
    .locator(".public-header .language-switcher select")
    .selectOption("th");
  for (const [width, height] of [
    [360, 900],
    [390, 844],
    [430, 900],
    [768, 1024],
    [820, 1180],
    [1024, 900],
    [1280, 900],
    [768, 360],
    [1024, 768],
    [1180, 820],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator("#medicalHistory").focus();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 820)
      await page.screenshot({
        path: "docs/qa/2026-10-28/health-choices-" + width + ".png",
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ", exact: true }),
  ).toBeVisible();
  const reg = await db.registration.findFirstOrThrow({
    where: { questionnaireVersion: qv },
    orderBy: { createdAt: "desc" },
  });
  const stored = decrypt<{
    healthSelections: {
      medicalHistory: { codes: string[]; custom: string[] };
      currentMedication: { custom: string[] };
      allergies: { status: string; codes: string[]; custom: string[] };
    };
    medicalHistory: string;
  }>(reg.draftEncrypted);
  expect(stored.healthSelections.medicalHistory.codes).toEqual([
    "diabetes",
    "hypertension",
  ]);
  expect(stored.healthSelections.medicalHistory.custom).toEqual([
    "Synthetic past illness",
  ]);
  expect(stored.healthSelections.currentMedication.custom).toEqual([
    "Synthetic medicine",
  ]);
  expect(stored.healthSelections.allergies).toEqual({
    status: "unknown",
    codes: [],
    custom: [],
  });
  expect(reg.draftEncrypted).not.toContain("Synthetic medicine");
  await page.goto("/register");
  await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" }).click();
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await expect(page.locator("#medicalHistory-custom-0")).toHaveValue(
    "Synthetic past illness",
  );
  const legacy = ["ประวัติเดิมบรรทัดแรก", "ประวัติเดิมบรรทัดที่สอง"].join(
    String.fromCharCode(10),
  );
  const response = await page.request.post("/api/v1/registrations", {
    headers: { Origin: "http://localhost:3037" },
    data: {
      person: {
        firstName: "Legacy",
        lastName: marker,
        birthdate: "1990-01-01",
        phone: "0814445566",
        medicalHistory: legacy,
        currentMedication: "ยาเดิมที่เคยบันทึก",
        allergies: "ไม่ทราบ",
      },
      answers: { allergy: "Legacy independent allergy detail" },
      questionnaireVersion: qv,
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/register");
  await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" }).click();
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("unknown");
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await expect(page.locator("#q-allergy-custom-0")).toHaveValue(
    "Legacy independent allergy detail",
  );
  await expect(page.locator("#medicalHistory")).toHaveValue("specified");
  await expect(page.locator("#medicalHistory-custom-0")).toHaveValue(legacy);
  await expect(page.locator("#currentMedication-custom-0")).toHaveValue(
    "ยาเดิมที่เคยบันทึก",
  );
  await expect(page.locator("#allergies")).toHaveValue("unknown");
});

test("remaining registration details support choices and stable removable family rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" }).click();
  await page.locator("#firstName").fill("AllChoices");
  await page.locator("#lastName").fill(marker);
  await page.locator("#birthdate").fill("1990-01-01");
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("self_pay");
  await page.locator("#phone").fill("0814445566");
  async function custom(id: string, text: string) {
    const box = page.locator('[data-field="' + id + '"]');
    if (id === "familyNcdDetails")
      await box.locator("xpath=ancestor::details").evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
    await box.locator("select").selectOption("specified");
    await box.getByRole("button", { name: /เพิ่มรายการ/ }).click();
    await box.locator("textarea").last().fill(text);
  }
  await custom("treatmentRightDetails", "Synthetic insurer");
  await page
    .locator('[data-field="treatmentRightDetails"] input[type="checkbox"]')
    .check();
  await custom("assistance", "Synthetic assistance");
  await page
    .locator('[data-field="assistance"] input[type="checkbox"]')
    .first()
    .check();
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  for (const id of ["medicalHistory", "currentMedication", "allergies"])
    await page.locator("#" + id).selectOption("none");
  await custom("currentMedication", "Synthetic regular medicine");
  await custom("surgeryHistory", "Synthetic surgery");
  await page
    .locator('[data-field="surgeryHistory"] input[type="checkbox"]')
    .check();
  await page.locator("#familyNcdStatus").selectOption("yes");
  for (const [relation, note] of [
    ["mother", "First relative detail"],
    ["father", "Remaining relative detail"],
  ]) {
    await page
      .getByRole("button", { name: "เพิ่มประวัติญาติสายตรง", exact: true })
      .click();
    const row = page.locator('select[name$=".relationship"]').last();
    await row.selectOption(relation);
    await page
      .locator('select[name$=".disease"]')
      .last()
      .selectOption("diabetes");
    const id = await page
      .locator('[data-field^="family-note-"]')
      .last()
      .getAttribute("data-field");
    await custom(id!, note);
  }
  await page
    .getByRole("button", { name: "ลบรายการญาติ", exact: true })
    .first()
    .click();
  await expect(page.locator('select[name$=".relationship"]')).toHaveValue(
    "father",
  );
  await expect(
    page.locator('[data-field^="family-note-"] textarea'),
  ).toHaveValue("Remaining relative detail");
  await custom("familyNcdDetails", "Synthetic family extra");
  await custom("q-extra_text", "Synthetic questionnaire detail");
  await page
    .locator('[data-field="q-extra_text"] input[type="checkbox"]')
    .check();
  await page.locator("#q-extra_number").fill("70");
  await page.locator("#q-medication").selectOption("มี");
  for (const id of ["allergy", "other", "medication_details", "family"])
    await expect(page.locator("#q-" + id)).toHaveCount(0);
  await page
    .locator(".public-header .language-switcher select")
    .selectOption("en");
  await expect(page.locator("#surgeryHistory-custom-0")).toHaveValue(
    "Synthetic surgery",
  );
  await page
    .locator(".public-header .language-switcher select")
    .selectOption("th");
  for (const width of [360, 390, 430, 768, 820, 1024, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 820) {
      await page.locator("#surgeryHistory").scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.screenshot({
        path: "docs/qa/2026-10-28/all-choices-" + width + ".png",
      });
    }
  }
  await page.getByRole("button", { name: "ดำเนินการต่อ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ", exact: true }),
  ).toBeVisible();
  const reg = await db.registration.findFirstOrThrow({
    where: { questionnaireVersion: qv },
    orderBy: { createdAt: "desc" },
  });
  const person = decrypt<{
    healthSelections: Record<string, { codes: string[]; custom: string[] }>;
    familyNcdEntries: { relationship: string; disease: string; note: string }[];
  }>(reg.draftEncrypted);
  expect(person.healthSelections.treatmentRightDetails.codes).toEqual([
    "pdh_hospital",
  ]);
  expect(person.healthSelections.assistance.custom).toEqual([
    "Synthetic assistance",
  ]);
  expect(person.healthSelections.surgeryHistory.custom).toEqual([
    "Synthetic surgery",
  ]);
  expect(person.healthSelections.familyNcdDetails.custom).toEqual([
    "Synthetic family extra",
  ]);
  expect(person.familyNcdEntries).toEqual([
    {
      relationship: "father",
      disease: "diabetes",
      note: "Remaining relative detail",
    },
  ]);
  expect(reg.draftEncrypted).not.toContain("Synthetic surgery");
  const assessment = decrypt<Record<string, string | number>>(
    reg.assessmentEncrypted!,
  );
  expect(assessment.extra_text).toBe(
    "Additional category; Synthetic questionnaire detail",
  );
  expect(assessment.extra_number).toBe(70);
  expect(assessment.allergy).toBe("ไม่มี");
  expect(assessment.other).toBe("ไม่มี");
  expect(assessment.medication_details).toBe("Synthetic regular medicine");
  expect(assessment.family).toEqual(["เบาหวาน"]);
});

test("diagnosis remains explicit and family reuse falls back for unsupported diseases", async ({
  page,
}) => {
  const q = await db.questionnaire.findUniqueOrThrow({
    where: { version: qv },
  });
  await db.questionnaire.update({
    where: { version: qv },
    data: {
      questions: [
        ...(q.questions as object[]),
        {
          id: "diabetes",
          label: "เคยได้รับการวินิจฉัยเบาหวานหรือไม่",
          type: "single",
          options: ["ไม่เคย", "เคย", "ไม่ทราบ"],
          required: true,
        },
      ],
      rules: [
        {
          id: "diagnosis-rule",
          field: "diabetes",
          equals: "เคย",
          decision: "needs_clinical_review",
          reason: "Synthetic explicit-answer rule",
        },
      ],
    },
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/register");
    await page
      .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล" })
      .click();
    await page.locator("#firstName").fill("Lean");
    await page.locator("#lastName").fill(marker);
    await page.locator("#birthdate").fill("1990-01-01");
    await page.locator("#sex").selectOption("unspecified");
    await page.locator("#treatmentRight").selectOption("unknown");
    await page.locator("#phone").fill("0814445566");
    await page
      .getByRole("button", { name: "ดำเนินการต่อ", exact: true })
      .click();
    await page.locator("#medicalHistory").selectOption("specified");
    const history = page.locator('[data-field="medicalHistory"]');
    await expect(history.getByLabel("เบาหวาน", { exact: true })).toHaveCount(0);
    await expect(
      history.getByLabel("เคยได้รับการผ่าตัด", { exact: true }),
    ).toHaveCount(0);
    await history.getByRole("button", { name: /เพิ่มรายการ/ }).click();
    await page
      .locator("#medicalHistory-custom-0")
      .fill("Other synthetic illness");
    await page.locator("#currentMedication").selectOption("none");
    await page.locator("#allergies").selectOption("unknown");
    await page.locator("#surgeryHistory").selectOption("none");
    await page.locator("#familyNcdStatus").selectOption("yes");
    await page
      .getByRole("button", { name: "เพิ่มประวัติญาติสายตรง", exact: true })
      .click();
    await page.locator('select[name$=".relationship"]').selectOption("father");
    await page.locator('select[name$=".disease"]').selectOption("stroke");
    await expect(page.locator("#q-family")).toBeVisible();
    await page.locator('select[name$=".disease"]').selectOption("diabetes");
    await expect(page.locator("#q-family")).toHaveCount(0);
    await page.locator("#q-diabetes").selectOption("เคย");
    for (const locale of ["en", "zh-Hans", "my", "km", "th"]) {
      await page
        .locator(".public-header .language-switcher select")
        .selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("#q-diabetes")).toHaveValue("เคย");
      await expect(page.locator("#medicalHistory-custom-0")).toHaveValue(
        "Other synthetic illness",
      );
    }
    fs.mkdirSync("docs/qa/2026-10-29", { recursive: true });
    for (const width of [390, 820]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator("#familyNcdStatus").scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.screenshot({
        path: "docs/qa/2026-10-29/lean-registration-" + width + ".png",
      });
    }

    await page
      .getByRole("button", { name: "ดำเนินการต่อ", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "3. เลือกแพ็กเกจ", exact: true }),
    ).toBeVisible();
    const reg = await db.registration.findFirstOrThrow({
      where: { questionnaireVersion: qv },
      orderBy: { createdAt: "desc" },
    });
    expect(
      decrypt<Record<string, unknown>>(reg.assessmentEncrypted!).diabetes,
    ).toBe("เคย");
    expect(
      decrypt<Record<string, unknown>>(reg.draftEncrypted).medicalHistory,
    ).toBe("Other synthetic illness");
    await expect(
      page.getByText(/Synthetic explicit-answer rule/),
    ).toBeVisible();
  } finally {
    await db.questionnaire.update({
      where: { version: qv },
      data: { questions: q.questions!, rules: q.rules! },
    });
  }
});
