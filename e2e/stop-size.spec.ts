import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The main button of a column is one box: home's, steam's and hot water's stop and steam's 'set timer' are
// 4.5rem high with one text size, and home's stop stays inside the viewport at every display size.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** width and height of the button, its computed font size and the root's font size, in px */
const read = (page: Page, id: string) =>
  page.getByTestId(id).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      font: getComputedStyle(node).fontSize,
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });

for (const [size, factor] of [
  ['medium', 1],
  ['extra large', 1.3],
] as const) {
  test(`at the display size ${size} the four main buttons have one height and one text size`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('pureflow.settings', JSON.stringify({ displaySize: value })), factor);
    const gateway = await mockGateway(page);
    gateway.putOnScale(525);
    await page.goto('/');
    await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');

    await toPage(page, 'steam');
    const set = await read(page, 'steam-set-timer');
    gateway.steamFor(18);
    await expect(page.getByTestId('steam-stop')).toBeVisible();
    const steam = await read(page, 'steam-stop');
    await page.screenshot({ path: `docs/product/stop-size-steam-${factor}.png` });
    gateway.waterEnded();
    await expect(page.getByTestId('steam-stop')).toHaveCount(0);

    await toPage(page, 'hot-water');
    gateway.waterFor('hotWater', 18, 6, 90);
    await expect(page.getByTestId('hot-water-stop')).toBeVisible();
    const water = await read(page, 'hot-water-stop');
    await page.screenshot({ path: `docs/product/stop-size-hot-water-${factor}.png` });
    gateway.waterEnded();
    await expect(page.getByTestId('hot-water-stop')).toHaveCount(0);

    await toPage(page, 'home');
    await gateway.replay(page, 0, 0.6);
    await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
    const home = await read(page, 'stop');
    await page.screenshot({ path: `docs/product/stop-size-home-${factor}.png` });

    for (const each of [home, steam, water, set]) {
      expect(each.height).toBeCloseTo(4.5 * each.rem, 0);
      expect(each.font).toBe(home.font);
    }
    expect(steam.width).toBeCloseTo(water.width, 0);
    // home's stop inside the viewport
    const viewport = page.viewportSize()!;
    const box = (await page.getByTestId('stop').boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(errors).toEqual([]);
  });
}
