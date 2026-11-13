import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
test.skip(process.env.PDH_SANDBOX_MODE !== "true", "Dedicated synthetic sandbox only");
for (const width of [390, 820, 1440]) {
  test(`executable sandbox and registration at ${width}px`, async ({ page }) => {
    const folder = process.env.SANDBOX_SCREENSHOT_DIR ?? "docs/qa/2026-11-12";
    mkdirSync(folder, { recursive: true });
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/sandbox");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ทดลองครบทุกขั้นตอน");
    await expect(page.getByText("ระบบต้นแบบ / SANDBOX", { exact: true })).toBeVisible();
    expect(await page.locator(".sandbox-grid article").count()).toBe(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: join(folder, `sandbox-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "ทดลองข้อมูลส่วนบุคคล →", exact: true }).click();
    await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล", exact: true }).click();
    await expect(page.locator("#firstName")).toBeVisible();
    await expect(page.getByText("แบบประเมินยังไม่ได้รับอนุมัติ", { exact: true })).toHaveCount(0);
    await page.locator("#firstName").fill("ผู้ทดสอบ");
    await page.locator("#lastName").fill("ตัวอย่าง");
    await page.reload();
    await page.getByRole("button", { name: "รับทราบและเริ่มกรอกข้อมูล", exact: true }).click();
    await expect(page.locator("#firstName")).toHaveValue("");
    // Unsaved identifying information must not be retained in browser storage.
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("ผู้ทดสอบ");
    await page.screenshot({ path: join(folder, `sandbox-registration-${width}.png`), fullPage: true });
  });
}
