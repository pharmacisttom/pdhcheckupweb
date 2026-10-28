import { test, expect } from '@playwright/test';
const item = { id: 'homepage-contract', name: 'Hospital API package', description: 'API contract fixture', audience: 'Adults', price: '1250.00', minAge: 18, maxAge: 65, preparation: 'Hospital instructions', version: 1, items: [{ id: 'service', code: 'CBC', nameTh: 'CBC', mode: 'included' }] };
for (const width of [390, 1280]) {
  test(`packages lead the homepage and retain booking links at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/v1/packages', route => route.fulfill({ json: { data: [item] } }));
    await page.goto('/');
    await expect(page.locator('main > section').first()).toHaveAttribute('id', 'packages');
    await expect(page.locator('#packages')).toHaveCount(1);
    const card = page.locator('#packages article');
    await expect(card).toContainText(item.name);
    expect((await card.boundingBox())!.y).toBeLessThan(600);
    await expect(card).toContainText('1,250');
    await expect(page.locator('header a[href="/bookings"]')).toBeVisible();
    await page.screenshot({ path: 'test-results/packages-' + width + '.png', fullPage: true });
    await card.getByRole('button').click();
    await expect(page.getByRole('dialog')).toContainText('CBC');
    await page.keyboard.press('Escape');
    const link = card.locator('a[href="/register?package=homepage-contract"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/register\?package=homepage-contract$/);
    await page.goto('/#packages');
    await expect(page.locator('#packages h1')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('packages show loading, empty and failed API states', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/packages', async route => { await gate; await route.fulfill({ json: { data: [] } }); });
  await page.goto('/');
  await expect(page.locator('#packages [role="status"]')).toBeVisible();
  release();
  await expect(page.locator('#packages .empty')).toBeVisible();
  await page.unroute('**/api/v1/packages');
  await page.route('**/api/v1/packages', route => route.fulfill({ status: 503, json: { error: { message: 'Package service unavailable' } } }));
  await page.reload();
  await expect(page.locator('#packages [role="alert"]')).toContainText('Package service unavailable');
});
