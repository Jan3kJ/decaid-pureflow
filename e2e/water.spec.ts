import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The water view on home (V1, acceptance item 9): hot water and flush, started at the
// machine; the frames are the mock's, shaped as the rig's (research.md 19). The workflow's
// targets are the rig's: hot water 30 s and 50 ml, flush 10 s.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const stream = (page: Page) => page.getByTestId('water-stream');
const offset = (page: Page) => stream(page).evaluate((element) => getComputedStyle(element).strokeDashoffset);

/** The stream's dashes run: its offset changes while the test looks. */
async function expectMoving(page: Page) {
  await expect(stream(page)).toHaveAttribute('data-moving', 'true');
  const first = await offset(page);
  await expect.poll(() => offset(page)).not.toBe(first);
}

/** The stream stands still: no animation, the same offset a while later. */
async function expectStill(page: Page) {
  await expect(stream(page)).toHaveAttribute('data-moving', 'false');
  expect(await stream(page).evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  const first = await offset(page);
  await page.waitForTimeout(400);
  expect(await offset(page)).toBe(first);
}

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

test('flush: the ring counts against rinseData, the stream falls into the drip tray and stops at flow 0', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  await expect(page.getByTestId('water-view')).toHaveCount(0);

  gateway.waterFor('flush', 6, 6, 90);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'flush');
  await expect(page.getByTestId('water-label')).toHaveText('Flush 6 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.600');
  // Home shows the run in place of the graph; stop is in the ring, once.
  await expect(page.getByTestId('empty-graph')).toHaveCount(0);
  await expect(page.getByTestId('stop')).toHaveCount(1);
  await expect(page.getByTestId('water-cup-fill')).toHaveCount(0);
  await expect(page.getByTestId('water-flow')).toHaveText('6.0 ml/s');
  await expect(page.getByTestId('water-temperature')).toHaveText('90 °C');
  // 90 °C is the hot end of the scale: the skin's temperature red.
  await expect(stream(page)).toHaveAttribute('stroke', 'rgb(255 107 107)');
  await expectMoving(page);
  await expectInsideViewport(page);
  await page.screenshot({ path: 'docs/product/water-flush.png' });

  // The simulated flush has flow 0 all along (research.md 19): the stream stands still.
  gateway.waterFlow(0, 1);
  await expect(page.getByTestId('water-label')).toHaveText('Flush 7 / 10 s');
  await expectStill(page);
  // Past the target the ring stays full and the seconds go on.
  gateway.waterFlow(0, 5);
  await expect(page.getByTestId('water-label')).toHaveText('Flush 12 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '1.000');

  await page.getByTestId('stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  await expect(page.getByTestId('stop')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('hot water without a scale: the cup fills to the flow added up, against hotWaterData', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.connectScale(false);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // 3 s at 8 ml/s: 24 ml of 50.
  gateway.waterFor('hotWater', 3, 8, 40);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
  await expect(page.getByTestId('water-label')).toHaveText('Hot water 3 / 30 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.100');
  await expect(page.getByTestId('water-amount')).toHaveText('24 / 50 ml');
  await expect(page.getByTestId('water-cup-fill')).toHaveAttribute('data-level', '0.480');
  // 40 °C: between the cold blue and the hot red.
  await expect(stream(page)).toHaveAttribute('stroke', 'rgb(128 147 213)');
  await expectMoving(page);
  const wide = Number(await stream(page).getAttribute('stroke-width'));

  // Less flow, a thinner stream; the mean of 8 and 2 for 1 s adds 5 ml.
  gateway.waterFlow(2, 1);
  await expect(page.getByTestId('water-amount')).toHaveText('29 / 50 ml');
  await expectMoving(page);
  expect(Number(await stream(page).getAttribute('stroke-width'))).toBeLessThan(wide);

  // The flow stops: the stream stands still, the cup keeps its level (1 more ml for the drop to 0).
  gateway.waterFlow(0, 1);
  await expect(page.getByTestId('water-amount')).toHaveText('30 / 50 ml');
  await expect(page.getByTestId('water-cup-fill')).toHaveAttribute('data-level', '0.600');
  await expectStill(page);
  expect(errors).toEqual([]);
});

test("hot water with a scale: the cup follows the scale's weight", async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  gateway.waterFor('hotWater', 4, 10, 75);
  gateway.putOnScale(31.4);
  await expect(page.getByTestId('water-amount')).toHaveText('31 / 50 g');
  await expect(page.getByTestId('water-amount')).toContainClass('weight');
  await expect(page.getByTestId('water-cup-fill')).toHaveAttribute('data-level', '0.628');
  await expectMoving(page);
  await expectInsideViewport(page);
  await page.screenshot({ path: 'docs/product/water-hot.png' });

  gateway.waterFlow(0, 1);
  gateway.putOnScale(44);
  await expect(page.getByTestId('water-amount')).toHaveText('44 / 50 g');
  await expect(page.getByTestId('water-cup-fill')).toHaveAttribute('data-level', '0.880');
  await expectStill(page);

  // The machine ends hot water by itself at the volume (as on the rig): home is back.
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  expect(errors).toEqual([]);
});
