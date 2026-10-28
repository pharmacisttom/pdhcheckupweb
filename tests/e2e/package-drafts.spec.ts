import { test, expect } from "@playwright/test";
import { loadEnvFile } from "node:process";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { syntheticStaff } from "./staff-fixture";
if (fs.existsSync(".env")) loadEnvFile(".env");
test.skip(
  process.env.SEED_DEMO !== "true",
  "Synthetic localhost development only",
);
test.setTimeout(120000);
const origin = { Origin: "http://localhost:3036" };
test("package draft cannot save without a service and persists the selected service after search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const actor = await syntheticStaff("manager");
  const db = new PrismaClient();
  const marker = "pkg-" + crypto.randomUUID();
  const service = await db.service.create({
    data: {
      code: marker,
      nameTh: "รายการตรวจทดสอบแพ็กเกจ",
      nameEn: "Package test service",
      category: "Test",
      componentCodes: [],
    },
  });
  try {
    expect(
      (
        await page.request.post("/api/v1/auth/login", {
          headers: origin,
          data: {
            email: actor.email,
            password: actor.password,
            mfa: actor.mfa(),
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/admin/packages");
    await page.getByRole("button", { name: "เพิ่มข้อมูล" }).click();
    const form = page.locator("form").filter({
      has: page.getByRole("heading", {
        name: "สร้างแพ็กเกจฉบับร่าง / เวอร์ชันใหม่",
      }),
    });
    const save = form.getByRole("button", {
      name: "บันทึกฉบับร่าง",
      exact: true,
    });
    await expect(save).toBeDisabled();
    await form.locator('[name="key"]').fill(marker);
    await form.locator('[name="name"]').fill("แพ็กเกจทดสอบการบันทึก");
    await form.locator('[name="description"]').fill("ข้อมูลทดสอบเท่านั้น");
    await form.locator('[name="audience"]').fill("ผู้ใหญ่");
    await form.locator('[name="fixedPrice"]').fill("1200");
    await form.locator('[name="effectiveFrom"]').fill("2026-10-22");
    await form.locator('[name="preparation"]').fill("ตามคำแนะนำของโรงพยาบาล");
    await form.getByLabel("ค้นหารายการตรวจด้วยชื่อหรือรหัส").fill(marker);
    const checkbox = form.getByRole("checkbox", { name: new RegExp(marker) });
    await expect(checkbox).toBeVisible();
    await expect(save).toBeDisabled();
    await checkbox.check();
    await expect(
      form.getByText("เลือกรายการตรวจแล้ว 1 รายการ", { exact: true }),
    ).toBeVisible();
    await expect(save).toBeEnabled();
    await checkbox.uncheck();
    await expect(save).toBeDisabled();
    await checkbox.check();
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/admin/packages") &&
        response.request().method() === "POST",
    );
    await save.click();
    expect((await saved).status()).toBe(200);
    const record = await db.package.findFirstOrThrow({
      where: { key: marker },
      include: { items: true },
    });
    expect(record.status).toBe("draft");
    expect(record.items.map((item) => item.serviceId)).toEqual([service.id]);
    await expect(page.getByText(/สร้างเวอร์ชันฉบับร่างแล้ว/)).toBeVisible();
  } finally {
    const records = await db.package.findMany({
      where: { key: marker },
      select: { id: true },
    });
    await db.packageItem.deleteMany({
      where: { packageId: { in: records.map((row) => row.id) } },
    });
    await db.package.deleteMany({ where: { key: marker } });
    await db.service.delete({ where: { id: service.id } });
    await actor.cleanup();
    await db.$disconnect();
  }
});
test("package service loading, empty and failed catalog states block saving and allow retry", async ({
  page,
}) => {
  const actor = await syntheticStaff("manager");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = false;
  try {
    await page.request.post("/api/v1/auth/login", {
      headers: origin,
      data: { email: actor.email, password: actor.password, mfa: actor.mfa() },
    });
    await page.route("**/api/v1/services?*", async (route) => {
      await gate;
      await route.fulfill(
        fail
          ? { status: 503, json: { error: { message: "Catalog unavailable" } } }
          : { json: { data: [] } },
      );
    });
    await page.goto("/admin/packages");
    await page.getByRole("button", { name: "เพิ่มข้อมูล" }).click();
    const fieldset = page.getByRole("group", {
      name: "รายการตรวจที่รวมในแพ็กเกจ",
    });
    const save = page.getByRole("button", {
      name: "บันทึกฉบับร่าง",
      exact: true,
    });
    await expect(
      fieldset.getByText("กำลังโหลดข้อมูล…", { exact: true }),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    release();
    await expect(
      fieldset.getByText(/ยังไม่มีรายการตรวจที่เปิดใช้งาน/),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    fail = true;
    await fieldset.getByLabel("ค้นหารายการตรวจด้วยชื่อหรือรหัส").fill("CBC");
    await expect(fieldset.getByRole("alert")).toContainText(
      "โหลดรายการตรวจไม่สำเร็จ",
    );
    await expect(save).toBeDisabled();
    fail = false;
    await fieldset
      .getByRole("button", { name: "ลองโหลดรายการตรวจอีกครั้ง" })
      .click();
    await expect(fieldset.getByText(/ไม่พบรายการตรวจตามคำค้น/)).toBeVisible();
    await expect(fieldset.getByRole("alert")).toHaveCount(0);
  } finally {
    release();
    await actor.cleanup();
  }
});
