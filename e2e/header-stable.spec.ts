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
    // the cell's own box without the finger's padding that a button has around it
    const element = node.querySelector('.value.scale')!;
    const style = getComputedStyle(element);
    const outer = element.getBoundingClientRect();
    const cell = {
      left: outer.left + parseFloat(style.paddingLeft),
      right: outer.right - parseFloat(style.paddingRight),
      top: outer.top + parseFloat(style.paddingTop),
      bottom: outer.bottom - parseFloat(style.paddingBottom),
    };
    return {
      slots: edges('.slot'),
      cell: [cell.left, cell.right, cell.top, cell.bottom],
      height: node.getBoundingClientRect().height,
    };
  });
}

type Layout = Awaited<ReturnType<typeof layout>>;

function expectSame(shown: Layout, first: Layout, state: string) {
  expect(shown.height, `${state}: height`).toBeCloseTo(first.height, 0);
  shown.cell.forEach((edge, i) => expect(Math.abs(edge - first.cell[i]), `${state}: scale cell edge ${i}`).toBeLessThanOrEqual(1));
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
    await expect(hint(page, screen)).toHaveText('no scale, tap to retry', { timeout: 15_000 });
    await check('not connected');

    // The scale away while the skin looks for it.
    gateway.decaidSettings.preferredScaleId = 'MockScale';
    await open(page, screen);
    await expect(reading(page, screen, 'group')).not.toHaveText('–');
    await expect(hint(page, screen)).toHaveText(/^(looking for scale|no scale)/);
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

for (const screen of ['home', 'steam', 'hot-water'] as const) {
  test(`the scale warning fills the scale cell on ${screen}; a tap on the sentence or the sign looks again`, async ({ page }) => {
    const gateway = await mockGateway(page);
    gateway.decaidSettings.preferredScaleId = null;
    gateway.connectScale(false);
    await open(page, screen);
    const root = page.getByTestId(`screen-${screen}`);
    const retry = root.getByTestId('scale-retry');
    const sentence = root.getByTestId('scale-hint');
    await expect(sentence).toHaveText('no scale, tap to retry', { timeout: 15_000 });
    const cell = (await retry.boundingBox())!;
    const header = (await root.locator('header.page-header').boundingBox())!;
    const frame = (await root.locator('[data-main-frame]').boundingBox())!;
    const sign = (await root.getByTestId('state-scale').boundingBox())!;
    const text = (await sentence.boundingBox())!;
    for (const box of [sign, text]) {
      expect(box.x).toBeGreaterThanOrEqual(cell.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(cell.x + cell.width + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(cell.y - 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(cell.y + cell.height + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(header.y + header.height + 0.5);
      expect(box.y + box.height, 'clear of the main frame').toBeLessThanOrEqual(frame.y);
    }
    // two rows of label size, nothing with pointer-events: none
    const style = await sentence.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { size: parseFloat(computed.fontSize), line: parseFloat(computed.lineHeight), events: computed.pointerEvents };
    });
    expect(style.size).toBeGreaterThanOrEqual(0.85 * 16 - 0.5);
    expect(text.height).toBeGreaterThan(style.line * 1.5);
    expect(style.events).not.toBe('none');
    if (screen !== 'hot-water')
      await page.screenshot({
        path: `e2e/.results/header-scale-warning-${screen}.png`,
        clip: { x: 0, y: 0, width: 1280, height: 120 },
      });

    for (const target of [sentence, root.getByTestId('state-scale')]) {
      const scans = gateway.calls('GET', '/api/v1/devices/scan').length;
      const box = (await target.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(() => gateway.calls('GET', '/api/v1/devices/scan').length).toBeGreaterThan(scans);
      // a tap during a round starts none: the second target is tapped on a fresh page
      await open(page, screen);
      await expect(sentence).toHaveText('no scale, tap to retry', { timeout: 15_000 });
    }
    expect(errors).toEqual([]);
  });
}
