import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The header never moves: each reading has a slot sized from its widest text, in place from the first frame, the
// header's height is the same in every state, and the scale's warning stays inside its slot.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

type Screen = 'home' | 'steam' | 'hot-water';

/** The left and right x of every reading's slot and the header's height, on the screen shown. */
async function layout(page: Page, screen: Screen) {
  const header = page.getByTestId(`screen-${screen}`).locator('header.page-header');
  await expect(header.getByTestId('status')).toBeVisible();
  return header.evaluate((node) => {
    const edges = (selector: string) =>
      [...node.querySelectorAll(selector)].map((element) => {
        const box = element.getBoundingClientRect();
        return [box.left, box.right];
      });
    return { slots: edges('.slot'), height: node.getBoundingClientRect().height };
  });
}

type Layout = Awaited<ReturnType<typeof layout>>;

function expectSame(shown: Layout, first: Layout, state: string) {
  expect(shown.height, `${state}: height`).toBeCloseTo(first.height, 0);
  for (const kind of ['slots'] as const) {
    expect(shown[kind], `${state}: ${kind}`).toHaveLength(4);
    shown[kind].forEach(([left, right], i) => {
      expect(Math.abs(left - first[kind][i][0]), `${state}: ${kind} ${i} left`).toBeLessThanOrEqual(1);
      expect(Math.abs(right - first[kind][i][1]), `${state}: ${kind} ${i} right`).toBeLessThanOrEqual(1);
    });
  }
}

const reading = (page: Page, screen: Screen, key: string) => page.getByTestId(`screen-${screen}`).getByTestId(`state-${key}`);
const hint = (page: Page, screen: Screen) => page.getByTestId(`screen-${screen}`).getByTestId('scale-hint');

async function open(page: Page, screen: Screen) {
  await page.goto('/');
  if (screen !== 'home') await toPage(page, screen);
}

for (const screen of ['home', 'steam', 'hot-water'] as const) {
  test(`the slots and the header's height are the same in every state on ${screen}`, async ({ page }) => {
    const gateway = await mockGateway(page);
    const seen: [string, Layout][] = [];
    const check = async (state: string) => seen.push([state, await layout(page, screen)]);

    // No machine: the slots stand there with a dash each.
    gateway.machineConnected = false;
    await open(page, screen);
    await expect(reading(page, screen, 'group')).toHaveText('–');
    await check('no machine');

    // A machine without a scale that is looked for no more: the sign in the scale's slot, the sentence beside.
    gateway.machineConnected = true;
    gateway.decaidSettings.preferredScaleId = null;
    gateway.connectScale(false);
    await open(page, screen);
    await expect(hint(page, screen)).toHaveText('scale not connected, tap to retry', { timeout: 15_000 });
    await check('not connected');

    // The scale away while the skin looks for it.
    gateway.decaidSettings.preferredScaleId = 'MockScale';
    await open(page, screen);
    await expect(reading(page, screen, 'group')).not.toHaveText('–');
    await expect(hint(page, screen)).toHaveText(/^scale (looking for it|not connected)/);
    await check('looking for the scale');

    // The scale there, with the weights.
    gateway.connectScale(true);
    for (const [grams, text] of [
      [0, '0.0 g'],
      [1234.5, '1234.5 g'],
      [-12.3, '-12.3 g'],
    ] as const) {
      gateway.putOnScale(grams);
      await expect(reading(page, screen, 'scale')).toHaveText(text);
      await check(`scale ${text}`);
    }

    // The tank, low and full.
    for (const level of [0.5, 99.9]) {
      gateway.setWater(level);
      await expect.poll(() => reading(page, screen, 'tank').textContent()).toContain(level === 0.5 ? ' ml' : 'ml');
      await check(`tank ${level} mm`);
    }
    gateway.setWater(38);

    // The steam heater, cold and hot.
    for (const steam of [99, 160]) {
      gateway.heatTo({ steam });
      await expect(reading(page, screen, 'steam')).toHaveText(`${steam} °C`);
      await check(`steam ${steam}`);
    }

    // A shot that runs, with a step name: on home, where it stays.
    if (screen === 'home') {
      gateway.workflow.profile.steps[1] = { ...gateway.workflow.profile.steps[1], name: 'Preinfusion with a long name' };
      gateway.runAtStep(1);
      await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Pouring');
      await expect(page.getByTestId('state-step')).toHaveCount(0);
      await check('a shot at a named step');
    }

    const [, first] = seen[0];
    for (const [state, shown] of seen) expectSame(shown, first, state);
    expect(errors).toEqual([]);
  });
}

test('the scale warning is a button in its slot; its sentence is drawn under the header and moves nothing', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.decaidSettings.preferredScaleId = null;
  gateway.connectScale(false);
  await page.goto('/');
  const retry = page.getByTestId('scale-retry');
  const sentence = page.getByTestId('scale-hint');
  await expect(sentence).toHaveText('scale not connected, tap to retry', { timeout: 15_000 });
  const slot = (await page.getByTestId('state-scale').boundingBox())!;
  const own = (await retry.boundingBox())!;
  expect(own.x).toBeLessThanOrEqual(slot.x);
  expect(own.x + own.width).toBeGreaterThanOrEqual(slot.x + slot.width);
  // the sentence is taken out of the flow, at the label size, whole inside the screen
  const line = await sentence.evaluate((node) => {
    const style = getComputedStyle(node);
    return { position: style.position, size: parseFloat(style.fontSize) };
  });
  expect(line.position).toBe('absolute');
  expect(line.size).toBeGreaterThanOrEqual(0.85 * 16 - 0.5);
  const header = (await page.getByTestId('screen-home').locator('header.page-header').boundingBox())!;
  const frame = (await page.getByTestId('screen-home').locator('[data-main-frame]').boundingBox())!;
  const shown = (await sentence.boundingBox())!;
  expect(shown.x).toBeGreaterThan(0);
  expect(shown.x + shown.width).toBeLessThanOrEqual(1280);
  // it hangs from the header over the frame's top edge
  expect(shown.y).toBeGreaterThanOrEqual(header.y);
  expect(shown.y).toBeLessThan(frame.y + 16);
  await page.screenshot({ path: 'e2e/.results/header-scale-warning.png', clip: { x: 0, y: 0, width: 1280, height: 120 } });

  // the tap still looks for the scale again
  const scans = gateway.calls('GET', '/api/v1/devices/scan').length;
  await retry.click();
  await expect.poll(() => gateway.calls('GET', '/api/v1/devices/scan').length).toBe(scans + 1);
  expect(errors).toEqual([]);
});
