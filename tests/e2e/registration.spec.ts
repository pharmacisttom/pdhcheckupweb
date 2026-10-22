import { test, expect } from "@playwright/test";
import { loadEnvFile } from "node:process";
import fs from "node:fs";
if (fs.existsSync(".env")) loadEnvFile(".env");
test.skip(
  process.env.SEED_DEMO !== "true",
  "Requires local development seed and test OTP provider",
);
test("six-step registration confirms a genuine MySQL appointment", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.getByLabel("ชื่อ *", { exact: true })).toBeVisible();
  await page.getByLabel("ชื่อ *", { exact: true }).fill("ทดสอบ" + Date.now());
  await page.getByLabel("นามสกุล *", { exact: true }).fill("สังเคราะห์");
  await page.getByLabel("วันเกิด (ค.ศ.) *", { exact: true }).fill("1990-01-01");
  await page
    .getByLabel("โทรศัพท์มือถือ *", { exact: true })
    .fill("081" + String(Date.now()).slice(-7));
  await page.getByRole("button", { name: "ขอรหัส OTP" }).click();
  const text = await page.getByText(/โหมดทดสอบ:/).innerText();
  const code = text.match(/\b\d{6}\b/)![0];
  await page.getByRole("textbox", { name: "รหัส OTP", exact: true }).fill(code);
  await page.getByRole("button", { name: "ยืนยันรหัส", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /ยืนยันเบอร์โทรแล้ว/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "2. ประเมินสุขภาพ" }),
  ).toBeVisible();
  const selects = page.locator('select[id^="q-"]');
  for (let i = 0; i < (await selects.count()); i++)
    await selects.nth(i).selectOption({ index: 1 });
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" }),
  ).toBeVisible();
  await page
    .locator(".package-card")
    .filter({
      has: page.getByRole("heading", {
        name: "[สาธิต] สุขภาพพื้นฐาน",
        exact: true,
      }),
    })
    .getByRole("button", { name: "เลือกแพ็กเกจ", exact: true })
    .click();
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "4. รายการเพิ่มเติม" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "5. วันนัดหมาย" }),
  ).toBeVisible();
  const day = page.getByLabel("วันนัดหมาย", { exact: true });
  const values = await day
    .locator("option")
    .evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    );
  let found = false;
  for (const value of values) {
    await day.selectOption(value);
    const slots = page.locator("button.slot:not(:disabled)");
    if (await slots.count()) {
      await slots.first().click();
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "6. ตรวจสอบและยืนยัน" }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ยืนยันการนัดหมาย" }).click();
  await expect(page).toHaveURL(/\/bookings\?confirmed=1/);
  await expect(page.getByRole("heading", { name: /^PDH-/ })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /QR สำหรับเจ้าหน้าที่/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/booking-confirmation.png",
    fullPage: true,
  });
});
test("staff login and database dashboard", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByLabel("อีเมล", { exact: true })
    .fill(process.env.SEED_ADMIN_EMAIL!);
  await page
    .getByLabel("รหัสผ่าน", { exact: true })
    .fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "ภาพรวมระบบตรวจสุขภาพ" }),
  ).toBeVisible();
  await expect(
    page.getByText("มูลค่านัดหมายประมาณการ", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
});

test("staff can pause online booking, receive callback details, and reopen booking", async ({
  browser,
}) => {
  const staff = await browser.newContext({ baseURL: 'http://localhost:3036' });
  const customer = await browser.newContext({ baseURL: 'http://localhost:3036' });
  const admin = await staff.newPage();
  const page = await customer.newPage();
  const origin = { Origin: "http://localhost:3036" };
  const login = await staff.request.post("/api/v1/auth/login", {
    headers: origin,
    data: {
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    },
  });
  expect(login.ok()).toBe(true);
  const previous = (
    await (await staff.request.get("/api/v1/admin/booking-policy")).json()
  ).data;
  try {
    // Compile the staff pages before the customer starts typing on the dev server.
    await admin.goto("/admin/contact-requests");
    await expect(
      admin.getByRole("heading", { name: "คำขอให้ติดต่อนัด" }),
    ).toBeVisible();
    await admin.goto("/admin/booking-control");
    await expect(admin.getByRole("checkbox")).toBeVisible();
    await admin.getByRole("checkbox").uncheck();
    await admin
      .getByLabel("ข้อความแจ้งเมื่อปิดรับนัดออนไลน์")
      .fill("ปิดรับนัดทดสอบ เจ้าหน้าที่จะติดต่อกลับ");
    await admin.getByRole("button", { name: "บันทึกรูปแบบรับนัด" }).click();
    await expect(admin.getByRole("status")).toHaveText("บันทึกการรับนัดแล้ว");
    expect(
      (await (await customer.request.get("/api/v1/slots")).json()).data,
    ).toEqual([]);
    const forbidden = await customer.request.post(
      "/api/v1/admin/booking-policy",
      {
        headers: origin,
        data: { onlineEnabled: true, message: "unauthorized" },
      },
    );
    expect([401, 403]).toContain(forbidden.status());
    await page.goto("/register");
    await expect(
      page.getByText("ปิดรับนัดทดสอบ เจ้าหน้าที่จะติดต่อกลับ"),
    ).toBeVisible();
    const name = "รอติดต่อ" + Date.now();
    await page.getByLabel("ชื่อ *", { exact: true }).fill(name);
    await page.getByLabel("นามสกุล *", { exact: true }).fill("ทดสอบ");
    await page
      .getByLabel("วันเกิด (ค.ศ.) *", { exact: true })
      .fill("1990-01-01");
    await page
      .getByLabel("โทรศัพท์มือถือ *", { exact: true })
      .fill("089" + String(Date.now()).slice(-7));
    await page.getByRole("button", { name: "ขอรหัส OTP" }).click();
    const code = (await page.getByText(/โหมดทดสอบ:/).innerText()).match(
      /\b\d{6}\b/,
    )![0];
    await page
      .getByRole("textbox", { name: "รหัส OTP", exact: true })
      .fill(code);
    await page.getByRole("button", { name: "ยืนยันรหัส", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /ยืนยันเบอร์โทรแล้ว/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
    await expect(
      page.getByRole("heading", { name: "2. ประเมินสุขภาพ" }),
    ).toBeVisible();
    const selects = page.locator('select[id^="q-"]');
    for (let i = 0; i < (await selects.count()); i++)
      await selects.nth(i).selectOption({ index: 1 });
    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
    await expect(
      page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" }),
    ).toBeVisible();
    await page
      .locator(".package-card")
      .filter({
        has: page.getByRole("heading", {
          name: "[สาธิต] สุขภาพพื้นฐาน",
          exact: true,
        }),
      })
      .getByRole("button", { name: "เลือกแพ็กเกจ", exact: true })
      .click();
    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
    await expect(
      page.getByRole("heading", { name: "4. รายการเพิ่มเติม" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
    await expect(
      page.getByRole("heading", { name: "6. ตรวจสอบและยืนยัน" }),
    ).toBeVisible();
    await expect(page.getByLabel("วันนัดหมาย", { exact: true })).toHaveCount(0);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", {
        name: "ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับ",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "ส่งข้อมูลให้เจ้าหน้าที่แล้ว" }),
    ).toBeVisible();
    const reference = await page
      .getByRole("heading", { name: /^PDH-C-/ })
      .innerText();
    expect(
      (await (await customer.request.get("/api/v1/bookings")).json()).data,
    ).toEqual([]);
    await page.getByRole("link", { name: "ตรวจสอบรายการของฉัน" }).click();
    await expect(page.getByRole("heading", { name: reference })).toBeVisible();
    await admin.goto("/admin/contact-requests");
    const card = admin
      .locator("article")
      .filter({ has: admin.getByRole("heading", { name: reference }) });
    await expect(card.getByText(new RegExp(name))).toBeVisible();
    await card.getByLabel("สถานะการติดต่อ").selectOption("contacted");
    await card
      .getByLabel("บันทึกการติดต่อ / วันเวลานัดที่ตกลง")
      .fill("ติดต่อผู้รับบริการแล้ว รอยืนยันวัน");
    await card.getByRole("button", { name: "บันทึกผลการติดต่อ" }).click();
    await expect(card).toHaveCount(0);
    await admin.getByLabel("กรองสถานะ").selectOption("contacted");
    await expect(card).toBeVisible();
    await expect(
      card.getByLabel("บันทึกการติดต่อ / วันเวลานัดที่ตกลง"),
    ).toHaveValue("ติดต่อผู้รับบริการแล้ว รอยืนยันวัน");
  } finally {
    expect(
      (
        await staff.request.post("/api/v1/admin/booking-policy", {
          headers: origin,
          data: {
            onlineEnabled: previous.onlineEnabled,
            message: previous.message,
          },
        })
      ).ok(),
    ).toBe(true);
    await customer.close();
    await staff.close();
  }
});
