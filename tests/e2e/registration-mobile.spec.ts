import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";

async function mockRegistrationApi(page: Page, failSave = false) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1/", "");
    let data: unknown = {};
    if (path === "auth/guest") data = { verified: true, otpRequired: false };
    else if (path === "packages" || path === "services" || path === "slots")
      data = [];
    else if (path === "questionnaire") data = { version: 1, questions: [] };
    else if (path === "registrations/draft") {
      if (failSave && request.method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "SYNTHETIC_PRIVATE_ERROR_SHOULD_NOT_ALERT" },
          }),
        });
        return;
      }
      data = null;
    }
    else if (path === "booking-policy")
      data = { onlineEnabled: false, message: "เจ้าหน้าที่จะติดต่อนัด" };
    else if (path === "registrations" && request.method() === "POST") {
      if (failSave) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "SYNTHETIC_PRIVATE_ERROR_SHOULD_NOT_ALERT" },
          }),
        });
        return;
      }
      data = { id: "synthetic-registration", decisions: [] };
    } else if (
      path === "contact-requests" &&
      request.method() === "POST"
    )
      data = { reference: "SYNTHETIC-RC02" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

async function fillRequiredPersonalData(page: Page) {
  await page.getByLabel("ชื่อ *", { exact: true }).fill("ทดสอบสังเคราะห์");
  await page.getByLabel("นามสกุล *", { exact: true }).fill("RC02");
  await page.getByLabel("วันเกิด (ค.ศ.) *", { exact: true }).fill("1990-01-01");
  await page.locator("#sex").selectOption("unspecified");
  await page.locator("#treatmentRight").selectOption("unknown");
  await page.getByLabel("โทรศัพท์มือถือ *", { exact: true }).fill("0812345678");
}

async function startRegistration(page: Page) {
  await page.goto("/register");
  await page
    .getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล", exact: true })
    .click();
  await expect(page.getByLabel("ชื่อ *", { exact: true })).toBeVisible();
}

async function fillHealthFields(page: Page) {
  for (const id of [
    "medicalHistory",
    "currentMedication",
    "allergies",
    "surgeryHistory",
  ])
    await page.locator(`#${id}`).selectOption("none");
  await page.locator("#familyNcdStatus").selectOption("unknown");
}

test("registration stays within all target widths on mobile and desktop", async ({
  page,
}) => {
  await mockRegistrationApi(page);
  await fs.mkdir("docs/qa/2026-11-16", { recursive: true });
  await startRegistration(page);
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      return [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => {
          if (element.closest(".stepper, .table-wrap, .responsive-table"))
            return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
        })
        .slice(0, 8)
        .map((element) => element.className || element.tagName);
    });
    expect(overflow, `horizontal overflow at ${width}px`).toEqual([]);
    if (width === 320 || width === 390 || width === 1440)
      await page.screenshot({
        path: `docs/qa/2026-11-16/rc02-register-${width}.png`,
        fullPage: true,
      });
  }
});

test("registration keeps fields between steps and reports server success only after confirmation", async ({
  page,
}) => {
  await mockRegistrationApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await startRegistration(page);
  await fillRequiredPersonalData(page);
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(page.getByRole("heading", { name: "2. ประเมินสุขภาพ" })).toBeVisible();
  await fillHealthFields(page);
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" })).toBeVisible();
  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  await expect(page.getByRole("heading", { name: "2. ประเมินสุขภาพ" })).toBeVisible();
  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  await expect(page.getByLabel("ชื่อ *", { exact: true })).toHaveValue(
    "ทดสอบสังเคราะห์",
  );
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" })).toBeVisible();
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(page.getByRole("heading", { name: "6. ตรวจสอบและยืนยัน" })).toBeVisible();
  await expect(page.getByText("ทดสอบสังเคราะห์", { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับ" })
    .click();
  await expect(page.locator(".swal2-toast")).toContainText("ส่งข้อมูลให้เจ้าหน้าที่แล้ว");
  await expect(page.getByText("SYNTHETIC-RC02", { exact: true })).toBeVisible();
});

test("registration uses a generic accessible alert for API errors", async ({
  page,
}) => {
  await mockRegistrationApi(page, true);
  await startRegistration(page);
  await fillRequiredPersonalData(page);
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await fillHealthFields(page);
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  const alert = page.locator(".swal2-popup");
  await expect(alert).toContainText("ไม่สามารถดำเนินการได้");
  await expect(alert).not.toContainText("SYNTHETIC_PRIVATE_ERROR_SHOULD_NOT_ALERT");
  await expect(page.getByText(/SYNTHETIC_PRIVATE_ERROR_SHOULD_NOT_ALERT/)).toBeVisible();
});
