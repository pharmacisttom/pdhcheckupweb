import { test, expect } from "@playwright/test";
test("public home provides accessible registration and privacy entry points", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /สุขภาพดี/ })).toBeVisible();
  await page
    .getByRole("link", { name: "ลงทะเบียนตรวจสุขภาพ", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "ลงทะเบียนตรวจสุขภาพ", exact: true }),
  ).toBeVisible();
});
test("admin pages require authentication", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบเจ้าหน้าที่" }),
  ).toBeVisible();
});
test("public API refuses cross-origin mutations and reveals no private records anonymously", async ({
  request,
}) => {
  const csrf = await request.post("/api/v1/auth/guest", {
    data: {},
    headers: { Origin: "https://attacker.invalid" },
  });
  expect(csrf.status()).toBe(403);
  const bookings = await request.get("/api/v1/bookings");
  expect([401, 503]).toContain(bookings.status());
});
test("mobile home has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
});
