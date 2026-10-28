import { expect, test } from "@playwright/test";

test("new health flow sends personal, coverage and family history and restores draft", async ({
  page,
}) => {
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/api/v1/")[1];
    let data: unknown = [];
    if (path === "auth/guest") data = { verified: true };
    if (path === "questionnaire") data = { version: 1, questions: [] };
    if (path === "booking-policy")
      data = { onlineEnabled: false, message: "เจ้าหน้าที่นัดหมายให้" };
    if (path === "registrations/draft")
      data = saved ? { id: "draft", ...saved } : null;
    if (path === "registrations") {
      saved = route.request().postDataJSON();
      data = { id: "draft", decisions: [] };
    }
    await route.fulfill({ json: { data } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.locator("#firstName").fill("ทดสอบ");
  await page.locator("#lastName").fill("ระบบ");
  await page.locator("#birthdate").fill("1990-01-01");
  await expect(page.getByText(/อายุ \d+ ปี/)).toBeVisible();
  await page.locator("#sex").selectOption("female");
  await page.locator("#treatmentRight").selectOption("social_security");
  await page.locator("#treatmentRightDetails").fill("โรงพยาบาลตามสิทธิ");
  // Changing the phone requires OTP again; mock a successful verification.
  await page.locator("#phone").fill("0812345678");
  await page.route("**/api/v1/otp/request", (route) =>
    route.fulfill({
      json: { data: { verificationId: "v", testCode: "123456" } },
    }),
  );
  await page.getByRole("button", { name: "ขอรหัส OTP" }).click();
  await page
    .getByRole("textbox", { name: "รหัส OTP", exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "ยืนยันรหัส", exact: true }).click();
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await page.locator("#medicalHistory").fill("ความดันโลหิตสูง");
  await page.locator("#currentMedication").fill("ยาประจำ");
  await page.locator("#allergies").fill("ไม่มี");
  await page.locator("#familyNcdStatus").selectOption("yes");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  expect(saved).toBeUndefined();
  await page.screenshot({ path: "test-results/health-intake-mobile.png", fullPage: true });
  await page.locator("#familyNcdDetails").fill("แม่เป็นเบาหวาน");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" }),
  ).toBeVisible();
  expect(saved?.person).toMatchObject({
    sex: "female",
    treatmentRight: "social_security",
    medicalHistory: "ความดันโลหิตสูง",
    familyNcdDetails: "แม่เป็นเบาหวาน",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("#sex")).toHaveValue("female");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(page.locator("#familyNcdDetails")).toHaveValue("แม่เป็นเบาหวาน");
  await page.locator("#familyNcdStatus").selectOption("no");
  await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();
  await expect(
    page.getByRole("heading", { name: "3. เลือกแพ็กเกจ" }),
  ).toBeVisible();
  expect(saved?.person).toMatchObject({
    familyNcdStatus: "no",
    familyNcdDetails: "",
  });
});


test('campaign gallery opens all source images on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/packages', route => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.locator('.campaign-section summary').click();
  await expect(page.locator('.campaign-grid img')).toHaveCount(16);
  for (const img of await page.locator('.campaign-grid img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.campaign-section').screenshot({ path: 'test-results/campaign-gallery-mobile.png' });
});
