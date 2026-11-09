import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Home's right column: lower-case captions, 'stops at' on one row, the rows as far apart as
// steam's, and the stop whole in view at every display size.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const SIZES = [
  ['medium', 1],
  ['extra large', 1.3],
] as const;
const ROWS = ['shot-timer', 'shot-weight', 'shot-pressure', 'shot-flow', 'shot-temperature'];

const open = async (page: Page, factor: number) => {
  await page.addInitScript((value) => localStorage.setItem('pureflow.settings', JSON.stringify({ displaySize: value })), factor);
  const gateway = await mockGateway(page);
  gateway.workflow.context = { ...gateway.workflow.context, targetYield: 120.5 };
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  return gateway;
};

/** the row of each value: its box */
const rowBoxes = (page: Page) =>
  Promise.all(
    ROWS.map(async (id) => (await page.getByTestId(id).locator('xpath=ancestor::*[contains(@class,"row")][1]').boundingBox())!),
  );

for (const [size, factor] of SIZES) {
  test(`at the display size ${size} the column is lower case, 'stops at' has one row and the rows are steam's apart`, async ({
    page,
  }) => {
    const gateway = await open(page, factor);
    await expect(page.getByTestId('shot-stops-at')).toHaveText('stops at 120.5 g');
    await page.screenshot({ path: `test-results/home-idle-${factor}.png` });
    await toPage(page, 'steam');
    const steam = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('[data-testid=steam-weight]')!.closest('.rows')!).rowGap),
    );
    await toPage(page, 'home');
    await page.screenshot({ path: `test-results/home-idle-${factor}.png` });
    await gateway.replay(page, 0, 0.6);
    await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');

    const transforms = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid=shot-column] .caption')].map((node) => getComputedStyle(node).textTransform),
    );
    expect(transforms.length).toBeGreaterThan(0);
    expect(new Set(transforms)).toEqual(new Set(['none']));

    // one line: its height is one line-height; a weight of 120.5 g is the longest value
    await page.getByTestId('shot-weight').evaluate((node) => {
      node.firstChild!.textContent = '120.5';
    });
    const label = page.getByTestId('shot-weight-label');
    const [first, second] = await Promise.all([0, 1].map(async (at) => (await label.locator('span').nth(at).boundingBox())!));
    expect(Math.abs(second.height - first.height)).toBeLessThanOrEqual(1);
    expect(Math.abs((await page.getByTestId('shot-stops-at').boundingBox())!.height - first.height)).toBeLessThanOrEqual(1);
    const caption = (await page.getByTestId('shot-weight-label').boundingBox())!;
    const number = (await page.getByTestId('shot-weight').boundingBox())!;
    expect(caption.x + caption.width).toBeLessThanOrEqual(number.x);

    // steam's row gap, then home's
    const boxes = await rowBoxes(page);
    const gaps = boxes.slice(1).map((each, at) => each.y - (boxes[at].y + boxes[at].height));
    await page.screenshot({ path: `test-results/home-running-${factor}.png` });
    for (const gap of gaps) expect(Math.abs(gap - steam)).toBeLessThanOrEqual(1);
    await gateway.replay(page, 0.6, 1);
    await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
    await page.screenshot({ path: `test-results/home-finished-${factor}.png` });
    expect(errors).toEqual([]);
  });

  test(`at the display size ${size} the stop lies inside the viewport`, async ({ page }) => {
    const gateway = await open(page, factor);
    await gateway.replay(page, 0, 0.6);
    await expect(page.getByTestId('stop')).toBeVisible();
    const stop = (await page.getByTestId('stop').boundingBox())!;
    const view = page.viewportSize()!;
    expect(stop.x).toBeGreaterThanOrEqual(0);
    expect(stop.y).toBeGreaterThanOrEqual(0);
    expect(stop.x + stop.width).toBeLessThanOrEqual(view.width);
    expect(stop.y + stop.height).toBeLessThanOrEqual(view.height);
    expect(errors).toEqual([]);
  });
}
