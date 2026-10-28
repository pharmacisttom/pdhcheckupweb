import { encrypt } from '../../src/lib/security';
import { operatorTotp } from '../../src/lib/mfa';
import { test, expect } from "@playwright/test";
import { loadEnvFile } from "node:process";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
if (fs.existsSync(".env")) loadEnvFile(".env");
test.skip(process.env.SEED_DEMO !== "true", "Synthetic local development only");

test("staff changes own password, logs in again and loses previous sessions", async ({
  page,
  browser,
}) => {
  const database = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.pathname !== "/pdh_healthcheck"
  )
    throw Error("Local development database required");
  const db = new PrismaClient();
  const email = crypto.randomUUID() + "@password.test";
  const original = "Before-" + crypto.randomUUID();
  const replacement = "After-" + crypto.randomUUID();
  const user = await db.user.create({
    data: {
      email,
      name: "Password browser test",
      role: "registration",
      passwordHash: await bcrypt.hash(original, 12),
      mfaSecret: encrypt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),
    },
  });
  const other = await browser.newContext({ baseURL: "http://localhost:3036" });
  const headers = { Origin: "http://localhost:3036" };
  try {
    expect(
      (
        await other.request.post("/api/v1/auth/change-password", {
          headers,
          data: {
            currentPassword: original,
            newPassword: replacement,
            confirmPassword: replacement,
          },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await other.request.post("/api/v1/auth/login", {
          headers,
          data: { email, password: original, mfa: operatorTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').generate() },
        })
      ).ok(),
    ).toBe(true);
    const warm = await other.newPage();
    await warm.goto("/admin/change-password");
    await expect(
      warm.getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true }),
    ).toBeEnabled();
    await warm.close();
    await page.goto("/login");
    await page.getByLabel("อีเมล", { exact: true }).fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(original);
    await page.locator('input[name="mfa"]').fill(operatorTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').generate());
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await page
      .getByRole("link", { name: "เปลี่ยนรหัสผ่าน", exact: true })
      .click();
    await page
      .getByLabel("รหัสผ่านเดิม", { exact: true })
      .fill("wrong-password");
    await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(replacement);
    await page
      .getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true })
      .fill(replacement);
    await page
      .getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true })
      .click();
    await expect(
      page.getByText("รหัสผ่านเดิมไม่ถูกต้อง", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("รหัสผ่านเดิม", { exact: true }).fill(original);
    await page
      .getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "เปลี่ยนรหัสผ่านสำเร็จ" }),
    ).toBeVisible();
    expect((await other.request.get("/api/v1/auth/me")).status()).toBe(401);
    await page.getByRole("link", { name: "เข้าสู่ระบบใหม่" }).click();
    await page.getByLabel("อีเมล", { exact: true }).fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(replacement);
    await page.locator('input[name="mfa"]').fill(operatorTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').generate());
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  } finally {
    await other.close();
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.audit.deleteMany({ where: { actorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
