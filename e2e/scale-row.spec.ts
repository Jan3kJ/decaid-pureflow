import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The scale row is one look on steam and hot water: 3 rem high, the caption centred against the
// number; the stop is one box on both pages; steam's column keeps its height without a scale.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const box = async (locator: Locator) => (await locator.boundingBox())!;
const middle = async (locator: Locator) => {
  const { y, height } = await box(locator);
  return y + height / 2;
};

/** the distance between the caption's and the number's vertical centres in a row */
const offset = async (row: Locator, number: Locator) => (await middle(row.locator('.key'))) - (await middle(number.locator('b')));

const rem = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

test('the scale row is 3 rem with the caption centred against the number on steam and hot water, and the stop is one box', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  const unit = await rem(page);

  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  const steamRow = page.getByTestId('steam-tare');
  const steamOffset = await offset(steamRow, page.getByTestId('steam-weight'));
  const steamHeight = (await box(steamRow)).height;
  const rows = (await box(page.locator('[data-testid=screen-steam] .rows'))).height;
  await page.screenshot({ path: 'test-results/scale-row-steam.png' });

  await toPage(page, 'hot-water');
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  const hotRow = page.getByTestId('hot-water-tare');
  const hotOffset = await offset(hotRow, page.getByTestId('hot-water-scale'));
  const hotHeight = (await box(hotRow)).height;
  const numberHeight = (await box(page.getByTestId('hot-water-scale').locator('b'))).height;
  const lastShot = page.getByTestId('hot-water-last-shot');
  const lastShotOffset = await offset(page.getByTestId('screen-hot-water').locator('.line').first(), lastShot);
  await page.screenshot({ path: 'test-results/scale-row-hot-water.png' });

  // the stop shows while the machine steams or pours hot water
  gateway.waterFor('hotWater', 30, 6, 90);
  const hotStop = await box(page.getByTestId('hot-water-stop'));
  gateway.waterEnded();
  await toPage(page, 'steam');
  gateway.steamFor(18, true);
  const steamStop = await box(page.getByTestId('steam-stop'));

  expect(Math.abs(steamOffset - hotOffset)).toBeLessThanOrEqual(1);
  expect(Math.abs(lastShotOffset - hotOffset)).toBeLessThanOrEqual(1);
  expect(steamHeight).toBeCloseTo(3 * unit, 0);
  expect(hotHeight).toBeCloseTo(3 * unit, 0);
  // the number fits the thin row
  expect(numberHeight).toBeLessThanOrEqual(hotHeight - 2);
  expect(steamStop.height).toBeCloseTo(hotStop.height, 0);
  expect(steamStop.width).toBeCloseTo(hotStop.width, 0);

  // without a scale the one line in place of the rows is as high as the scale row
  gateway.connectScale(false);
  await toPage(page, 'steam');
  const none = await box(page.getByTestId('steam-no-scale'));
  expect(none.height).toBeCloseTo(steamHeight, 0);
  expect(rows).toBeGreaterThanOrEqual(steamHeight);
});
