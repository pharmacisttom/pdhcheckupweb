import { test, expect, type Page } from "@playwright/test";
import { proposeRc03Questionnaire } from "../../src/lib/rc03-questionnaire";
import { ageOn } from "../../src/lib/patient-validation";

async function setup(page: Page) {
  let saved: {
    id: string;
    person: Record<string, unknown>;
    answers: Record<string, unknown>;
    questionnaireVersion: number;
  } | null = null;
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const path = url.pathname.replace("/api/v1/", "");
    let data: unknown = [];
    if (path === "auth/guest") data = { verified: true, otpRequired: false };
    if (path === "questionnaire")
      data = {
        version: url.searchParams.has("version")
          ? Number(url.searchParams.get("version"))
          : 2,
        ...proposeRc03Questionnaire([], []),
      };
    if (path === "organizations/registration")
      data = [{ id: "synthetic-org", name: "หน่วยงานสังเคราะห์" }];
    if (path === "booking-policy")
      data = { onlineEnabled: false, message: "Synthetic contact mode" };
    if (path === "registrations/draft") data = saved;
    if (path === "registrations" && req.method() === "POST") {
      const body = req.postDataJSON();
      submissions.push(body);
      saved = {
        id: "synthetic-rc03",
        person: body.person,
        answers: body.answers,
        questionnaireVersion: 1,
      };
      data = { id: saved.id, decisions: [] };
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
  return submissions;
}
async function start(page: Page) {
  await page.goto("/register");
  await page
    .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล", exact: true })
    .click();
  await expect(page.locator("#firstName")).toBeVisible();
}
async function demographics(page: Page) {
  await page.locator("#firstName").fill("สังเคราะห์");
  await page.locator("#lastName").fill("RC03");
  await page.getByLabel("วันเกิด (ค.ศ.) *", { exact: true }).fill("1991-11-24");
  await page.locator("#heightCm").fill("170");
  await page.locator("#weightKg").fill("70");
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("unknown");
  await page.getByLabel("โทรศัพท์มือถือ *", { exact: true }).fill("0812345678");
}
test("group, family checkboxes, snoring and BMI survive back/forward and saved reload", async ({
  page,
}) => {
  const submissions = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await demographics(page);
  await page
    .getByRole("radio", { name: "หน่วยงาน / กลุ่ม", exact: true })
    .check();
  await page
    .getByLabel("หน่วยงาน *", { exact: true })
    .selectOption("synthetic-org");
  await page
    .getByLabel("ผู้ประสานงานหลัก *", { exact: true })
    .fill("ผู้ประสานงานสังเคราะห์");
  await page
    .getByLabel("โทรศัพท์ผู้ประสานงาน *", { exact: true })
    .fill("0812345678");
  await expect(
    page.getByRole("status").filter({ hasText: "BMI" }),
  ).toContainText("24.22");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  for (const id of [
    "medicalHistory",
    "currentMedication",
    "allergies",
    "surgeryHistory",
  ])
    await page.locator("#" + id).selectOption("none");
  await page.locator("#familyNcdStatus").selectOption("yes");
  await page
    .getByRole("group", { name: "มารดา", exact: true })
    .getByLabel("เบาหวาน", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "บิดา", exact: true })
    .getByLabel("โรคหลอดเลือดสมอง", { exact: true })
    .check();
  await page.locator("#q-snoring_history").selectOption("unknown");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  await expect(page.locator("#q-snoring_history")).toHaveValue("unknown");
  await expect(
    page
      .getByRole("group", { name: "มารดา", exact: true })
      .getByLabel("เบาหวาน", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  await expect(page.locator("#heightCm")).toHaveValue("170");
  await expect(
    page.getByLabel("ผู้ประสานงานหลัก *", { exact: true }),
  ).toHaveValue("ผู้ประสานงานสังเคราะห์");
  await page.reload();
  await page
    .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล", exact: true })
    .click();
  await expect(page.locator("#weightKg")).toHaveValue("70");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(page.locator("#q-snoring_history")).toHaveValue("unknown");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  expect(submissions[1]).toMatchObject({
    id: "synthetic-rc03",
    questionnaireVersion: 1,
    person: { heightCm: 170, weightKg: 70, registrationMode: "group" },
  });
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toMatch(/สังเคราะห์|snoring|0812345678/);
});
test("Thai ID errors reject excess characters without silently truncating", async ({
  page,
}) => {
  await setup(page);
  await start(page);
  await demographics(page);
  await page.locator("#documentType").selectOption("thai_id");
  for (const value of [
    "110170020345",
    "1101700203459",
    "11017002034500",
    "1101700203450x",
  ]) {
    await page.locator("#identifier").fill(value);
    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
    await expect(page.locator("#identifier")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator("#identifier-error")).toBeVisible();
    await page.getByRole("button", { name: "ตกลง", exact: true }).click();
    await expect(page.locator("#identifier")).toHaveValue(value);
  }
  const prefix = "110170020345",
    sum = [...prefix].reduce((n, d, i) => n + Number(d) * (13 - i), 0);
  await page.locator("#identifier").fill(prefix + ((11 - (sum % 11)) % 10));
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "2. ประเมินสุขภาพ" }),
  ).toBeVisible();
});
test("age display follows Bangkok even in an American browser timezone", async ({
  page,
}) => {
  await setup(page);
  await page.clock.install({ time: new Date("2026-11-23T17:00:00Z") });
  await start(page);
  await demographics(page);
  expect(ageOn("1991-11-24", new Date("2026-11-23T17:00:00Z"))).toBe(35);
  await expect(
    page.getByRole("status").filter({ hasText: "ตั้งแต่ 35 ปีขึ้นไป" }),
  ).toBeVisible();
});
