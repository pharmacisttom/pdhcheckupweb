import { test, expect } from "@playwright/test";
import { loadEnvFile } from "node:process";
import fs from "node:fs";
import { syntheticStaff } from "./staff-fixture";
import { operatorTotp } from "../../src/lib/mfa";
if (fs.existsSync(".env")) loadEnvFile(".env");
test.skip(process.env.SEED_DEMO !== "true", "Synthetic local development only");
test.setTimeout(120000);
const headers = { Origin: "http://localhost:3036" };
test("administrator invites staff; owner activates and confirms MFA without protected API access beforehand", async ({
  page,
  browser,
}) => {
  const actor = await syntheticStaff();
  const owner = await browser.newContext({ baseURL: "http://localhost:3036" });
  const ids: string[] = [];
  try {
    const login = await page.request.post("/api/v1/auth/login", {
      headers,
      data: { email: actor.email, password: actor.password, mfa: actor.mfa() },
    });
    expect(login.ok()).toBe(true);
    // Warm the protected route before enrollment state exists: Next dev route
    // compilation can otherwise trigger HMR in the owner's separate context.
    expect((await page.request.get("/admin/dashboard")).ok()).toBe(true);
    await page.goto("/admin/users");
    await expect(
      page.getByRole("heading", { name: "จัดการผู้ใช้งาน", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: actor.email }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect
      .poll(() =>
        page
          .locator(".sidebar")
          .evaluate((el) => el.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
    await page.screenshot({
      path: "test-results/staff-users-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({
      path: "test-results/staff-users.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "สร้างบัญชีเจ้าหน้าที่" }).click();
    const email = crypto.randomUUID() + "@invited-browser.invalid";
    const form = page.locator(".staff-editor form").first();
    await form.getByLabel("ชื่อเจ้าหน้าที่").fill("เจ้าหน้าที่ทดสอบ");
    await form.getByLabel("อีเมลเจ้าหน้าที่").fill(email);
    await form.getByLabel("รหัสผ่านของผู้ดูแล").fill(actor.password);
    await form.getByLabel("MFA ของผู้ดูแล").fill(actor.mfa());
    await form
      .getByRole("button", { name: "บันทึกบัญชี", exact: true })
      .click();
    const link = page.getByLabel("ลิงก์คำเชิญ");
    await expect(link).toBeVisible();
    const activationUrl = await link.inputValue();
    const users = (
      await (
        await page.request.get(
          "/api/v1/admin/users?q=" + encodeURIComponent(email),
        )
      ).json()
    ).data.users;
    ids.push(users[0].id);
    const enrollment = await owner.newPage();
    const remoteRequests: string[] = [];
    enrollment.on("request", (req) => {
      if (new URL(req.url()).origin !== "http://localhost:3036")
        remoteRequests.push(req.url());
    });
    await enrollment.goto(activationUrl);
    await expect(enrollment).toHaveURL(/\/auth\/activate$/);
    const password = "Owner-only-" + crypto.randomUUID();
    await enrollment.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(password);
    await enrollment
      .getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true })
      .fill(password);
    await enrollment
      .getByRole("button", { name: "บันทึกรหัสผ่านและดำเนินการต่อ" })
      .click();
    await expect(enrollment).toHaveURL(/\/auth\/mfa\/setup$/);
    expect((await owner.request.get("/api/v1/admin/dashboard")).status()).toBe(
      403,
    );
    const protectedPage = await owner.request.get("/admin/dashboard", {
      maxRedirects: 0,
    });
    expect(protectedPage.status()).toBe(307);
    expect(protectedPage.headers().location).toBe("/auth/mfa/setup");
    await enrollment.getByRole("button", { name: "เริ่มตั้งค่า MFA" }).click();
    const key = enrollment.getByLabel("คีย์ MFA");
    await expect(key).toBeVisible();
    const secret = (await key.textContent())!;
    await expect(
      enrollment.getByRole("img", {
        name: "QR สำหรับตั้งค่า Authenticator ของบัญชีนี้",
      }),
    ).toHaveAttribute("src", /^data:image\/png;base64,/);
    await enrollment
      .getByLabel("รหัสยืนยัน 6 หลัก")
      .fill(operatorTotp(secret).generate());
    await enrollment
      .getByRole("button", { name: "ยืนยันและเปิดใช้งาน MFA" })
      .click();
    await expect(enrollment).toHaveURL(/\/admin\/dashboard$/);
    expect((await owner.request.get("/api/v1/auth/me")).status()).toBe(200);
    expect(remoteRequests).toEqual([]);
    await page.reload();
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toContainText("ยืนยันแล้ว");
  } finally {
    await owner.close();
    await actor.cleanup(ids);
  }
});
test("temporary-password staff must replace password before browser MFA enrollment", async ({
  page,
}) => {
  const actor = await syntheticStaff();
  const ids: string[] = [];
  try {
    await page.request.post("/api/v1/auth/login", {
      headers,
      data: { email: actor.email, password: actor.password, mfa: actor.mfa() },
    });
    const email = crypto.randomUUID() + "@temporary-browser.invalid";
    const temporary = "Temporary-only-" + crypto.randomUUID();
    const create = await page.request.post("/api/v1/admin/users", {
      headers,
      data: {
        email,
        name: "Temporary browser user",
        role: "registration",
        temporaryPassword: temporary,
        verification: { password: actor.password, mfa: actor.mfa() },
      },
    });
    expect(create.ok()).toBe(true);
    ids.push((await create.json()).data.user.id);
    await page.request.post("/api/v1/auth/logout", { headers, data: {} });
    await page.goto("/login");
    await page.getByLabel("อีเมล", { exact: true }).fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(temporary);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await expect(page).toHaveURL(/\/auth\/password$/);
    const replacement = "Changed-only-" + crypto.randomUUID();
    await page.getByLabel("รหัสผ่านเดิม").fill(temporary);
    await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(replacement);
    await page
      .getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true })
      .fill(replacement);
    await page
      .getByRole("button", { name: "บันทึกรหัสผ่านและดำเนินการต่อ" })
      .click();
    await expect(page).toHaveURL(/\/auth\/mfa\/setup$/);
    await page.getByRole("button", { name: "เริ่มตั้งค่า MFA" }).click();
    const key = page.getByLabel("คีย์ MFA");
    await expect(key).toBeVisible();
    await page
      .getByLabel("รหัสยืนยัน 6 หลัก")
      .fill(operatorTotp((await key.textContent())!).generate());
    await page.getByRole("button", { name: "ยืนยันและเปิดใช้งาน MFA" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  } finally {
    await actor.cleanup(ids);
  }
});
