import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile, type MockGateway } from './mock-gateway';

// The hot water page (R5, spec 3.7, acceptance item 20) against a mocked gateway: the split
// steam tab opens it; temperature, flow, time and stop at weight are written to the
// workflow's hotWaterData; a ratio favourite with a last shot of 40 g sets 80 g for 1:2; the
// favourites come from the settings; its tare button tares. That Decaid stops hot water at the
// weight is the rig's to show (e2e-rig/hot-water.spec.ts): the mock has no pump.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

async function overflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const outside = [...document.querySelectorAll('button, section, header, aside')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5);
    });
    return { scrolls: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight, outside: outside.length };
  });
}

/** Types a value on the number pad that a tap on `testid` opens. */
async function type(page: Page, testid: string, value: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

/** A shot in the history whose final weight is `grams`. */
function shotOf(gateway: MockGateway, grams: number) {
  gateway.addShot('shot-40', '2026-10-17T07:00:00', profile('A-Flow / default-medium', 42, 9), { targetYield: 40 });
  gateway.shots.at(-1)!.annotations.actualYield = grams;
}

const lastWrite = (gateway: MockGateway) =>
  gateway.calls('PUT', '/api/v1/workflow').filter((call) => call.body.hotWaterData).at(-1)?.body.hotWaterData;

test('the split steam tab: steam keeps most of it, hot water the rest at the bottom, and opens the page', async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  const steam = (await page.getByTestId('open-steam').boundingBox())!;
  const water = (await page.getByTestId('open-hot-water').boundingBox())!;
  expect(water.y).toBeGreaterThan(steam.y + steam.height - 1);
  expect(water.y + water.height).toBeGreaterThan(780);
  expect(steam.height).toBeGreaterThan(2 * water.height);
  // A finger's target, at least 56 CSS pixels each way.
  expect(water.height).toBeGreaterThan(56);
  await page.screenshot({ path: 'docs/product/home-tabs.png' });

  await page.getByTestId('open-hot-water').click();
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  // Starting stays at the machine: there is no start button, and nothing runs to stop.
  await expect(page.getByRole('button', { name: /start/i })).toHaveCount(0);
  await expect(page.getByTestId('hot-water-stop')).toHaveCount(0);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  // The steam part still opens the steam page.
  await page.getByTestId('open-steam').click();
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  expect(errors).toEqual([]);
});

test('temperature, flow, time and stop at weight are written to hotWaterData (item 20)', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-hot-water').click();
  // The workflow's values, as the rig holds them.
  await expect(page.getByTestId('hot-water-temperature')).toContainText('75°C');
  await expect(page.getByTestId('hot-water-flow')).toContainText('10ml/s');
  await expect(page.getByTestId('hot-water-time')).toContainText('30s');
  await expect(page.getByTestId('hot-water-weight')).toContainText('50g');

  await type(page, 'hot-water-temperature', '85');
  expect(lastWrite(gateway)).toEqual({ targetTemperature: 85, duration: 30, volume: 50, flow: 10 });
  await type(page, 'hot-water-flow', '6.5');
  await type(page, 'hot-water-time', '45');
  await type(page, 'hot-water-weight', '120');
  expect(lastWrite(gateway)).toEqual({ targetTemperature: 85, duration: 45, volume: 120, flow: 6.5 });
  expect(gateway.workflow.hotWaterData).toEqual({ targetTemperature: 85, duration: 45, volume: 120, flow: 6.5 });
  await expect(page.getByTestId('hot-water-weight')).toContainText('120g');
  await expect(page.getByTestId('hot-water-flow')).toContainText('6.5ml/s');

  // The number pad keeps a value inside Streamline's ranges.
  await page.getByTestId('hot-water-temperature').click();
  await expect(page.getByTestId('numpad-range')).toHaveText('50 to 95 °C');
  await expect(page.getByTestId('numpad-key-dot')).toBeDisabled();
  await page.getByTestId('numpad-cancel').click();
  expect(errors).toEqual([]);
});

test('a ratio favourite with a last shot of 40 g sets 80 g for 1:2; the tare button tares (item 20)', async ({ page }) => {
  const gateway = await mockGateway(page);
  shotOf(gateway, 40);
  gateway.putOnScale(212.4);
  await page.goto('/');
  await page.getByTestId('open-hot-water').click();
  await expect(page.getByTestId('hot-water-last-shot')).toHaveText('40.0 g');
  const ratios = page.getByTestId('hot-water-ratio');
  await expect(ratios).toHaveText(['1:2 80 g', '1:2.5 100 g', '1:3 120 g']);

  await ratios.nth(0).click();
  expect(lastWrite(gateway)).toEqual({ targetTemperature: 75, duration: 30, volume: 80, flow: 10 });
  await expect(page.getByTestId('hot-water-weight')).toContainText('80g');
  await expect(ratios.nth(0)).toHaveClass(/on/);
  await ratios.nth(1).click();
  await expect(page.getByTestId('hot-water-weight')).toContainText('100g');
  await expect(ratios.nth(0)).not.toHaveClass(/on/);

  // The tare button: the one tare of the skin (R2).
  await expect(page.getByTestId('hot-water-scale')).toHaveText('212.4 g');
  await expect(page.getByTestId('hot-water-tare')).toBeEnabled();
  await page.getByTestId('hot-water-tare').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/scale/tare').length).toBe(1);
  await expect(page.getByTestId('hot-water-scale')).toHaveText('0.0 g');

  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });
  await page.screenshot({ path: 'docs/product/hot-water.png' });
  expect(errors).toEqual([]);
});

test('the favourites come from the settings; without a last shot or a scale nothing is offered', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-hot-water').click();
  await expect(page.getByTestId('hot-water-last-shot')).toHaveText('–');
  for (const chip of await page.getByTestId('hot-water-ratio').all()) await expect(chip).toBeDisabled();

  // The settings' category Hot water.
  await page.getByTestId('nav-home').click();
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-hot-water')).toBeVisible();
  await expect(page.getByTestId('setting-ratio-1')).toContainText('1:2');
  await type(page, 'setting-ratio-1', '1.5');
  await expect(page.getByTestId('setting-ratio-1')).toContainText('1:1.5');
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  shotOf(gateway, 40);
  gateway.connectScale(false);
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-hot-water').click();
  await expect(page.getByTestId('hot-water-ratio')).toHaveText(['1:1.5 60 g', '1:2.5 100 g', '1:3 120 g']);
  await page.getByTestId('hot-water-ratio').first().click();
  expect(lastWrite(gateway)?.volume).toBe(60);
  // Without a scale there is nothing to tare.
  await expect(page.getByTestId('hot-water-tare')).toBeDisabled();
  // The ratios are a part of the settings object, so the KV backup carries them.
  await expect
    .poll(() => (gateway.store['decaid-skin/settings-backup'] as any)?.settings?.hotWater?.ratios ?? null)
    .toEqual([1.5, 2.5, 3]);
  expect(errors).toEqual([]);
});
