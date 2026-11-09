import { expect, test, type Page } from '@playwright/test';
import type { Backup } from '../src/settings-backup';
import { MEASUREMENTS, mockGateway, profile, type MockGateway } from './mock-gateway';
import { back, toPage } from './touch';

// The hot water page against a mocked gateway: its page dot
// opens it (there are no tabs); temperature, flow, time and stop at weight are written to the
// workflow's hotWaterData; a ratio favourite with a last shot of 40 g sets 80 g for 1:2; the
// favourites come from the settings; its tare button tares. Without a scale the row reads stop at
// volume in ml. That Decaid stops hot water at the
// weight is the rig's to show (e2e-rig/hot-water.spec.ts): the mock has no pump. A value
// is a line with its number above it; the page shows no ring while hot water pours
// (e2e/hot-water-live.spec.ts), a flush has one, and the left edge has no state dot.

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
    // In the settings page's panels, which scroll, only the width counts.
    const scrolled = (element: Element) =>
      !!element.parentElement?.closest('[data-testid="settings-content"], [aria-label="settings categories"]');
    const outside = [...document.querySelectorAll('button, section, header, aside')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        (rect.left < 0 || rect.right > innerWidth + 0.5 || (!scrolled(element) && (rect.top < 0 || rect.bottom > innerHeight + 0.5)))
      );
    });
    return { scrolls: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight, outside: outside.length };
  });
}

/** A hot water line takes a tap to light and a second on its number to open the number pad; a settings row opens it at once. */
async function openPad(page: Page, testid: string) {
  const number = page.getByTestId(testid);
  await number.click();
  if ((await page.getByTestId('numpad').count()) === 0) await number.click();
  await expect(page.getByTestId('numpad')).toBeVisible();
}

/** Types a value on the number pad that two taps on `testid` open. */
async function type(page: Page, testid: string, value: string) {
  await openPad(page, testid);
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

/** A shot in the history whose last scale reading is `grams`; its actualYield is `yielded`. */
function shotOf(gateway: MockGateway, grams: number, yielded = grams) {
  gateway.addShot('shot-40', '2026-10-17T07:00:00', profile('A-Flow / default-medium', 42, 9), { targetYield: 40 });
  gateway.shots.at(-1)!.annotations!.actualYield = yielded;
  gateway.measurements['shot-40'] = MEASUREMENTS.map((measurement, i, all) => ({
    ...measurement,
    scale: i === all.length - 1 && measurement.scale ? { ...measurement.scale, weight: grams } : measurement.scale,
  }));
}

/** The hotWaterData of the last workflow write. It reaches the gateway after the tap: poll it. */
const lastWrite = (gateway: MockGateway) =>
  gateway
    .calls('PUT', '/api/v1/workflow')
    .filter((call) => call.body.hotWaterData)
    .at(-1)?.body.hotWaterData;

test('the hot water dot opens the page; it has no start button', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');

  await toPage(page, 'hot-water');
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  // Starting stays at the machine: there is no start button, and nothing runs to stop.
  await expect(page.getByRole('button', { name: /start/i })).toHaveCount(0);
  await expect(page.getByTestId('hot-water-stop')).toHaveCount(0);
  await back(page);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  // The steam dot opens the steam page.
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  expect(errors).toEqual([]);
});

test('temperature, flow, time and stop at weight are written to hotWaterData (item 20)', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'hot-water');
  // The workflow's values, as the rig holds them.
  await expect(page.getByTestId('hot-water-temperature')).toContainText('75°C');
  await expect(page.getByTestId('hot-water-flow')).toContainText('10ml/s');
  await expect(page.getByTestId('hot-water-time')).toContainText('30s');
  await expect(page.getByTestId('hot-water-weight')).toContainText('50g');

  await type(page, 'hot-water-temperature', '85');
  await expect.poll(() => lastWrite(gateway)).toEqual({ targetTemperature: 85, duration: 30, volume: 50, flow: 8 });
  await type(page, 'hot-water-flow', '6.5');
  await type(page, 'hot-water-time', '45');
  await type(page, 'hot-water-weight', '120');
  await expect.poll(() => lastWrite(gateway)).toEqual({ targetTemperature: 85, duration: 45, volume: 120, flow: 6.5 });
  expect(gateway.workflow.hotWaterData).toEqual({ targetTemperature: 85, duration: 45, volume: 120, flow: 6.5 });
  await expect(page.getByTestId('hot-water-weight')).toContainText('120g');
  await expect(page.getByTestId('hot-water-flow')).toContainText('6.5ml/s');

  // The number pad keeps a value inside Streamline's ranges.
  await openPad(page, 'hot-water-temperature');
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
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('hot-water-last-shot')).toHaveText('40.0 g');
  const ratios = page.getByTestId('hot-water-ratio');
  await expect(ratios).toHaveText(['1:2 80 g', '1:2.5 100 g', '1:3 120 g']);

  await ratios.nth(0).click();
  await expect.poll(() => lastWrite(gateway)).toEqual({ targetTemperature: 75, duration: 30, volume: 80, flow: 8 });
  await expect(page.getByTestId('hot-water-weight')).toContainText('80g');
  await expect(ratios.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await ratios.nth(1).click();
  await expect(page.getByTestId('hot-water-weight')).toContainText('100g');
  await expect(ratios.nth(0)).not.toHaveAttribute('aria-pressed', 'true');

  // The scale's row is the tare, the one tare of the skin: one button of 3 rem (as thin as the stop's edge) over the row,
  // live while idle; 'last shot' and 'scale' end on one right edge, their units in one column.
  await expect(page.getByTestId('hot-water-scale')).toHaveText('212.4 g');
  const row = page.getByTestId('hot-water-tare');
  await expect(row).toBeEnabled();
  await expect(row).toHaveText(/^scale\s*212\.4\s*g$/);
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(3 * 16 - 0.5);
  expect((await row.boundingBox())!.height).toBeLessThan(3.5 * 16);
  await expect(page.getByText(/tap to tare|tared/)).toHaveCount(0);
  const part = async (id: string, part: string) => (await page.getByTestId(id).locator(part).boundingBox())!;
  const [shot, scale] = [await part('hot-water-last-shot', 'b'), await part('hot-water-scale', 'b')];
  expect(Math.abs(shot.x + shot.width - (scale.x + scale.width))).toBeLessThanOrEqual(1);
  expect(Math.abs((await part('hot-water-last-shot', 'i')).x - (await part('hot-water-scale', 'i')).x)).toBeLessThanOrEqual(1);
  await page.getByTestId('hot-water-tare').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/scale/tare').length).toBe(1);
  await expect(page.getByTestId('hot-water-scale')).toHaveText('0.0 g');

  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });
  await page.screenshot({ path: 'docs/product/hot-water.png' });
  expect(errors).toEqual([]);
});

test('the favourites come from the settings; without a last shot or a scale they are off', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('hot-water-last-shot')).toHaveText('–');
  await expect(page.getByTestId('hot-water-ratio')).toHaveCount(3);
  for (const chip of await page.getByTestId('hot-water-ratio').all()) await expect(chip).toBeDisabled();

  // The settings' category Hot water.
  await back(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('settings-hot-water')).toBeVisible();
  await expect(page.getByTestId('setting-ratio-1')).toContainText('1:2');
  await type(page, 'setting-ratio-1', '1.5');
  await expect(page.getByTestId('setting-ratio-1')).toContainText('1:1.5');
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  shotOf(gateway, 40);
  gateway.connectScale(false);
  await back(page);
  await toPage(page, 'hot-water');
  // Without a scale the favourites stay, in ml: the shot's grams estimate the water.
  await expect(page.getByTestId('hot-water-ratio')).toHaveText(['1:1.5 60 ml', '1:2.5 100 ml', '1:3 120 ml']);
  await page.getByTestId('hot-water-ratio').first().click();
  await expect.poll(() => lastWrite(gateway)?.volume).toBe(60);
  await expect(page.getByTestId('hot-water-scale')).toHaveText('–');
  await page.screenshot({ path: 'docs/product/hot-water-no-scale.png' });
  // Without a scale a tap tares nothing and looks for the scale.
  const tares = gateway.calls('PUT', '/api/v1/scale/tare').length;
  const scans = gateway.calls('GET', '/api/v1/devices/scan').length;
  await page.getByTestId('hot-water-tare').click();
  await expect.poll(() => gateway.calls('GET', '/api/v1/devices/scan').length).toBe(scans + 1);
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(tares);
  // The ratios are a part of the settings object, so the KV backup carries them.
  await expect
    .poll(() => (gateway.store['pureflow/settings-backup'] as Backup | undefined)?.settings?.hotWater?.ratios ?? null)
    .toEqual([1.5, 2.5, 3]);
  expect(errors).toEqual([]);
});

test('stop at weight in g with a scale, stop at volume in ml without one; favourites off without a weighed shot', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.connectScale(false);
  // The last shot was pulled without a scale: it has no weight.
  gateway.addShot('shot-unweighed', '2026-10-17T07:00:00', profile('A-Flow / default-medium', 42, 9), { targetYield: 40 });
  gateway.shots.at(-1)!.annotations = { actualDoseWeight: 18 };
  gateway.measurements['shot-unweighed'] = MEASUREMENTS.map((measurement) => ({ ...measurement, scale: null }));
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expect(page.getByRole('slider', { name: 'stop at volume' })).toBeVisible();
  await expect(page.getByTestId('hot-water-weight')).toContainText('50ml');
  await expect(page.getByRole('slider', { name: 'stop at volume' })).toHaveAttribute('aria-valuemax', '500');
  await expect(page.getByTestId('hot-water-last-shot')).toHaveText('–');
  await expect(page.getByTestId('hot-water-ratio')).toHaveCount(3);
  for (const chip of await page.getByTestId('hot-water-ratio').all()) await expect(chip).toBeDisabled();

  // The number pad in ml writes the same field, the number as it is.
  await openPad(page, 'hot-water-weight');
  await expect(page.getByTestId('numpad-range')).toHaveText('10 to 500 ml');
  await page.getByTestId('numpad-cancel').click();
  await type(page, 'hot-water-weight', '150');
  await expect.poll(() => lastWrite(gateway)).toEqual({ targetTemperature: 75, duration: 30, volume: 150, flow: 8 });
  await expect(page.getByTestId('hot-water-weight')).toContainText('150ml');

  // The scale connects: the same row reads stop at weight in g, the number unchanged.
  gateway.connectScale(true);
  await expect(page.getByRole('slider', { name: 'stop at weight' })).toHaveAttribute('aria-valuenow', '150');
  await expect(page.getByTestId('hot-water-weight')).toContainText('150g');
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });
  expect(errors).toEqual([]);
});

test('a line per value: a tap lights it, a drag moves it from where it was and writes once when let go', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('hot-water-time')).toContainText('30s');
  await expect(page.getByTestId('hot-water-hint')).toHaveCount(0);

  // Four lines, one under the other; the number stands above its line, no caption, no thumb.
  const ids = ['temperature', 'flow', 'time', 'weight'];
  const boxes = [];
  for (const id of ids) {
    const value = (await page.getByTestId(`hot-water-${id}`).boundingBox())!;
    const slider = (await page.getByTestId(`hot-water-slider-${id}`).boundingBox())!;
    expect(value.y + value.height).toBeLessThan(slider.y + slider.height * 0.66);
    expect(slider.height).toBeGreaterThanOrEqual(40);
    boxes.push(slider);
  }
  for (let i = 1; i < boxes.length; i += 1) expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
  await expect(page.locator('.label')).toHaveCount(0);
  const time = page.getByTestId('hot-water-slider-time');
  await expect(time).toHaveAttribute('role', 'slider');
  await expect(time).toHaveAttribute('aria-label', 'time');
  await expect(time).toHaveAttribute('aria-valuemin', '5');
  await expect(time).toHaveAttribute('aria-valuemax', '120');
  await expect(time).toHaveAttribute('aria-valuenow', '30');
  await expect(page.getByTestId('hot-water-slider-flow')).toHaveAttribute('aria-valuemax', '8');

  // A tap lights only that line and moves nothing, wherever on the line it lands.
  const writes = () => gateway.calls('PUT', '/api/v1/workflow').filter((call) => call.body.hotWaterData).length;
  const box = (await time.boundingBox())!;
  const y = box.y + box.height * 0.7;
  await expect(time).toHaveAttribute('data-lit', 'false');
  await page.mouse.click(box.x + box.width * 0.9, y);
  await expect(time).toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('hot-water-slider-flow')).toHaveAttribute('data-lit', 'false');
  await expect(time).toHaveAttribute('aria-valuenow', '30');
  expect(writes()).toBe(0);
  await page.screenshot({ path: 'docs/product/hot-water-lit.png' });
  // A tap elsewhere puts it out.
  await page.getByTestId('hot-water-last-shot').click({ force: true });
  await expect(time).toHaveAttribute('data-lit', 'false');

  // A drag from anywhere on the line: the value follows by the travel, nothing is written before the release.
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 5 });
  const dragged = Number(await time.getAttribute('aria-valuenow'));
  expect(dragged).toBeGreaterThan(80);
  await expect(page.getByTestId('hot-water-time')).toContainText(`${dragged}s`);
  expect(writes()).toBe(0);
  await page.mouse.up();
  await expect.poll(writes).toBe(1);
  expect(lastWrite(gateway)).toEqual({ targetTemperature: 75, duration: dragged, volume: 50, flow: 8 });
  await expect(page.getByTestId('hot-water-time')).toContainText(`${dragged}s`);

  // The arrow keys step: one 0.1 from the held 8.
  await page.getByTestId('hot-water-slider-flow').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => lastWrite(gateway)?.flow).toBe(7.9);
  await expect(page.getByTestId('hot-water-flow')).toContainText('7.9ml/s');

  // A second tap on the number of a lit line opens the number pad.
  await openPad(page, 'hot-water-weight');
  await page.getByTestId('numpad-cancel').click();
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });
  expect(errors).toEqual([]);
});

test('a flush covers the rows with its ring; the rows come back after', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(0);
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('hot-water-time')).toBeVisible();
  // No state dot and no column on the left edge.
  await expect(page.getByTestId('nav-status')).toHaveCount(0);
  await expect(page.locator('.page > nav')).toHaveCount(0);

  const screen = page.getByTestId('screen-hot-water');
  const covered = (id: string) =>
    page.evaluate((id) => {
      const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return !!hit?.closest('[data-testid="water-cover"]');
    }, id);
  gateway.waterFor('flush', 3, 6, 90);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'flush');
  await expect.poll(() => covered('hot-water-time')).toBe(true);
  expect(await covered('hot-water-slider-time')).toBe(true);
  // One stop: the ring's; the right column stays.
  await expect(screen.getByTestId('hot-water-stop')).toHaveCount(0);
  await expect(page.getByTestId('water-stop')).toHaveCount(1);
  await expect(screen.getByTestId('hot-water-tare')).toBeVisible();
  expect(await covered('hot-water-tare')).toBe(false);
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  await page.getByTestId('water-stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(screen.getByTestId('hot-water-time')).toContainText('30s');
  expect(await covered('hot-water-time')).toBe(false);
  expect(errors).toEqual([]);
});

test('the last shot is the same weight on home and on hot water, whatever the annotated actualYield says', async ({ page }) => {
  const gateway = await mockGateway(page);
  // The scale read 44.6 g at the end; Decaid's annotation says 45.6 g.
  shotOf(gateway, 44.6, 45.6);
  await page.goto('/');
  await expect(page.getByTestId('shot-weight')).toHaveText('44.6g');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('hot-water-last-shot')).toHaveText('44.6 g');
  // The ratio chips follow it: 44.6 g times 2 is 89 g.
  await expect(page.getByTestId('hot-water-ratio').first()).toHaveText('1:2 89 g');
});

test('a shot of 0 g shows a dash on home and on hot water, whose ratio chips are off and write nothing (acceptance 169)', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  shotOf(gateway, 0);
  await page.goto('/');
  await expect(page.getByTestId('shot-weight')).toHaveText('–g');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('hot-water-last-shot')).toHaveText('–');
  const ratios = page.getByTestId('hot-water-ratio');
  await expect(ratios).toHaveCount(3);
  for (const chip of await ratios.all()) await expect(chip).toBeDisabled();
  await expect(ratios.first()).toHaveCSS('opacity', '0.4');
  const writes = gateway.calls('PUT', '/api/v1/workflow').length;
  await ratios.first().click({ force: true });
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(writes);
});
