import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// While hot water runs, the hot water page has no ring: the time and weight lines fill with the
// live values, a brighter line over the set one with the live number under its end, and the
// column's stop stops it. A flush keeps its ring.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The live line's share of its slider's width, in px */
async function liveWidth(page: import('@playwright/test').Page, id: string) {
  return (await page.getByTestId(`hot-water-slider-${id}-live`).boundingBox())!.width;
}

test('the time and weight lines fill with the live values; no ring; the column stops it', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(0);
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('hot-water-slider-time-live')).toHaveCount(0);

  gateway.waterFor('hotWater', 6, 4, 80);
  gateway.putOnScale(12.4);
  await expect(page.getByTestId('hot-water-slider-time-live')).toHaveCount(1);
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('water-ring')).toHaveCount(0);
  // The live numbers under the lines' ends; the set values stay above.
  await expect(page.getByTestId('hot-water-time-live')).toHaveText('6 s');
  await expect(page.getByTestId('hot-water-weight-live')).toHaveText('12.4 g');
  await expect(page.getByTestId('hot-water-time')).toContainText('30s');
  await expect(page.getByTestId('hot-water-weight')).toContainText('50g');
  // The temperature and flow lines show no live line.
  await expect(page.getByTestId('hot-water-slider-flow-live')).toHaveCount(0);

  // 6 s of the 5 to 120 s line, 12.4 g of the 10 to 500 g line.
  const time = (await page.getByTestId('hot-water-slider-time').boundingBox())!;
  const early = await liveWidth(page, 'time');
  expect(early / time.width).toBeCloseTo((6 - 5) / 115, 1);
  const weight = (await liveWidth(page, 'weight')) / time.width;
  expect(weight).toBeCloseTo((12.4 - 10) / 490, 1);

  // They grow: more water, more time.
  gateway.waterFlow(4, 10);
  gateway.putOnScale(37);
  await expect(page.getByTestId('hot-water-time-live')).toHaveText('16 s');
  await expect(page.getByTestId('hot-water-weight-live')).toHaveText('37.0 g');
  expect(await liveWidth(page, 'time')).toBeGreaterThan(early * 5);
  expect(await liveWidth(page, 'weight')).toBeGreaterThan(weight * time.width * 5);

  // The lines are not moved while it runs; the column's stop is the only one.
  await expect(page.getByTestId('hot-water-slider-time')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('hot-water-tare')).toBeDisabled();
  await page.screenshot({ path: 'docs/product/hot-water-pouring.png' });
  const before = gateway.calls('PUT', '/api/v1/machine/state/idle').length;
  await page.getByTestId('hot-water-stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(before + 1);
  gateway.waterEnded();
  await expect(page.getByTestId('hot-water-slider-time-live')).toHaveCount(0);
  await expect(page.getByTestId('hot-water-stop')).toHaveCount(0);
  await expect(page.getByTestId('hot-water-slider-time')).toHaveAttribute('aria-disabled', 'false');
  expect(errors).toEqual([]);
});

test('without a scale the weight line fills with the ml so far', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.connectScale(false);
  await page.goto('/');
  await toPage(page, 'hot-water');
  // 4 ml/s for 5 s, a frame every half second.
  gateway.waterFor('hotWater', 5, 4, 80);
  await expect(page.getByTestId('hot-water-weight-live')).toHaveText(/^\d+ ml$/);
  const poured = Number((await page.getByTestId('hot-water-weight-live').innerText()).replace(' ml', ''));
  expect(poured).toBeGreaterThanOrEqual(15);
  expect(poured).toBeLessThanOrEqual(21);
  await expect(page.getByTestId('hot-water-time-live')).toHaveText('5 s');
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('hot water seen from home keeps the ring, and a flush on its page has one too', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  gateway.waterFor('hotWater', 4, 8, 80);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('hot-water-slider-time-live')).toHaveCount(1);
  gateway.waterEnded();
  await expect(page.getByTestId('hot-water-slider-time-live')).toHaveCount(0);

  gateway.waterFor('flush', 4, 6, 90);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'flush');
  await expect(page.getByTestId('hot-water-slider-time-live')).toHaveCount(0);
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  expect(errors).toEqual([]);
});
