import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The water view on home (V1 and R3, acceptance items 9 and 19): hot water and flush, started
// at the machine; the frames are the mock's, shaped as the rig's (research.md 19). The
// workflow's targets are the rig's: hot water 30 s and 50 ml, flush 10 s. Since R3 (spec 3.7)
// there is no picture: the countdown ring, and the values inside the stop button.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

async function expectInsideViewport(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const outside = [...document.querySelectorAll('button, section, svg')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5);
    });
    return { scrolls: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight, outside: outside.length };
  });
  expect(overflow).toEqual({ scrolls: false, outside: 0 });
}

/** No group head picture: the view's only drawing is the ring, and nothing in it is an image. */
async function expectNoPicture(page: Page) {
  const view = page.getByTestId('water-view');
  await expect(view.locator('svg')).toHaveCount(1);
  await expect(page.getByTestId('water-ring').locator('svg')).toHaveCount(1);
  await expect(view.getByRole('img')).toHaveCount(0);
  for (const id of ['water-stream', 'water-cup-fill', 'water-amount']) await expect(page.getByTestId(id)).toHaveCount(0);
}

/**
 * The ring's and the stop button's height against the water view's inner height, to two
 * decimals, and whether the ring's centre is the view's.
 */
async function ringShare(page: Page) {
  return page.evaluate(() => {
    const view = document.querySelector('[data-testid="water-view"]')!;
    const style = getComputedStyle(view);
    const outer = view.getBoundingClientRect();
    const top = outer.top + view.clientTop + parseFloat(style.paddingTop);
    const inner = view.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const ring = view.querySelector('[data-testid="water-ring"]')!.getBoundingClientRect();
    const stop = view.querySelector('[data-testid="stop"]')!.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 100) / 100;
    const centred =
      Math.abs(ring.top + ring.height / 2 - (top + inner / 2)) < 1 &&
      Math.abs(ring.left + ring.width / 2 - (outer.left + outer.width / 2)) < 1;
    return { ring: round(ring.height / inner), stop: round(stop.height / inner), centred };
  });
}

/** The values sit inside the stop button. */
async function expectInStop(page: Page, ids: string[]) {
  for (const id of ids) await expect(page.getByTestId('stop').getByTestId(id)).toBeVisible();
}

test('flush: no picture, the ring counts against rinseData, stop shows temperature, flow and time', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  await expect(page.getByTestId('water-view')).toHaveCount(0);

  gateway.waterFor('flush', 6, 6, 90);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'flush');
  await expect(page.getByTestId('water-label')).toHaveText('Flush');
  await expect(page.getByTestId('water-time')).toHaveText('6 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.600');
  // Home shows the run in place of the graph; stop is in the ring, once.
  await expect(page.getByTestId('empty-graph')).toHaveCount(0);
  await expect(page.getByTestId('stop')).toHaveCount(1);
  await expectNoPicture(page);
  await expect(page.getByTestId('water-temperature')).toHaveText('90 °C');
  await expect(page.getByTestId('water-flow')).toHaveText('6.0 ml/s');
  await expectInStop(page, ['water-label', 'water-time', 'water-temperature', 'water-flow']);
  // Flush shows no weight, though the mock's scale is connected.
  await expect(page.getByTestId('water-weight')).toHaveCount(0);
  await expectInsideViewport(page);
  // The ring is 85 % of the panel's height, centred (spec 3.9 item 14), stop scaled with it.
  expect(await ringShare(page)).toEqual({ ring: 0.85, stop: 0.7, centred: true });
  await page.screenshot({ path: 'docs/product/water-flush.png' });

  // The simulated flush has flow 0 all along (research.md 19); the ring goes on.
  gateway.waterFlow(0, 1);
  await expect(page.getByTestId('water-time')).toHaveText('7 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.700');
  await expect(page.getByTestId('water-flow')).toHaveText('0.0 ml/s');
  // Past the target the ring stays full and the seconds go on.
  gateway.waterFlow(0, 5);
  await expect(page.getByTestId('water-time')).toHaveText('12 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '1.000');

  await page.getByTestId('stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  await expect(page.getByTestId('stop')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('hot water without a scale: no picture, no weight; the ring counts against hotWaterData', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.connectScale(false);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  gateway.waterFor('hotWater', 3, 8, 40);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
  await expect(page.getByTestId('water-label')).toHaveText('Hot water');
  await expect(page.getByTestId('water-time')).toHaveText('3 / 30 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.100');
  await expectNoPicture(page);
  await expect(page.getByTestId('water-temperature')).toHaveText('40 °C');
  await expect(page.getByTestId('water-flow')).toHaveText('8.0 ml/s');
  await expectInStop(page, ['water-time', 'water-temperature', 'water-flow']);
  await expect(page.getByTestId('water-weight')).toHaveCount(0);

  gateway.waterFlow(2, 1);
  await expect(page.getByTestId('water-time')).toHaveText('4 / 30 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.133');
  await expect(page.getByTestId('water-flow')).toHaveText('2.0 ml/s');
  expect(errors).toEqual([]);
});

test("hot water with a scale: the stop button shows the scale's weight in g", async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  gateway.waterFor('hotWater', 4, 10, 75);
  gateway.putOnScale(31.4);
  await expect(page.getByTestId('water-weight')).toHaveText('31.4 g');
  await expectInStop(page, ['water-time', 'water-temperature', 'water-flow', 'water-weight']);
  await expect(page.getByTestId('water-time')).toHaveText('4 / 30 s');
  await expect(page.getByTestId('water-temperature')).toHaveText('75 °C');
  await expect(page.getByTestId('water-flow')).toHaveText('10.0 ml/s');
  await expectNoPicture(page);
  await expectInsideViewport(page);
  await page.screenshot({ path: 'docs/product/water-hot.png' });

  gateway.waterFlow(0, 1);
  gateway.putOnScale(44);
  await expect(page.getByTestId('water-weight')).toHaveText('44.0 g');
  await expect(page.getByTestId('water-time')).toHaveText('5 / 30 s');

  // The machine ends hot water by itself at the volume (as on the rig): home is back.
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  expect(errors).toEqual([]);
});
