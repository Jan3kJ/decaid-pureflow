import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Hot water's main frame is home's graph frame: the same border, radius and glass, with the four
// lines and their numbers inside it, clear of the edge and the rounded corners.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const FRAME = ['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius', 'backgroundColor'] as const;

const styleOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element, keys) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(keys.map((key) => [key, style[key]]));
  }, FRAME);

test("hot water's main frame has the border, radius and glass of home's graph frame; the lines lie inside it", async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  const home = await styleOf(page, '[data-testid=empty-graph]');
  expect(home.borderTopWidth).toBe('1px');

  await toPage(page, 'hot-water');
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  const frame = page.locator('[data-testid=screen-hot-water] [data-main-frame]');
  expect(await styleOf(page, '[data-testid=screen-hot-water] [data-main-frame]')).toEqual(home);

  const box = (await frame.boundingBox())!;
  const radius = await frame.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius));
  expect(radius).toBeGreaterThan(0);
  const lines = ['flow', 'temperature', 'time', 'weight'];
  for (const id of lines) {
    const slider = (await page.getByTestId(`hot-water-slider-${id}`).boundingBox())!;
    const number = (await page.getByTestId(`hot-water-${id}`).boundingBox())!;
    for (const rect of [slider, number]) {
      expect(rect.x).toBeGreaterThanOrEqual(box.x + radius);
      expect(rect.y).toBeGreaterThanOrEqual(box.y + radius);
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width - radius);
      expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height - radius);
    }
  }

  await page.screenshot({ path: 'test-results/hot-water-frame-idle.png' });
  // The frame stays when a line is lit.
  await page.getByTestId('hot-water-slider-temperature').click();
  expect(await styleOf(page, '[data-testid=screen-hot-water] [data-main-frame]')).toEqual(home);
  await page.screenshot({ path: 'test-results/hot-water-frame-lit.png' });
});
