import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile, type MockGateway } from './mock-gateway';

// Why the finished shot stopped, against the mocked gateway: the stop frame of Decaid's shot
// sequencer on /ws/v1/machine/shotState gives one line in the hint look under the time and
// weight of home's right column, for the shot it came in; it goes when the next shot starts. The
// other reasons, a shot recalled from the history and the newest record after a reload have none.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const line = (page: Page) => page.getByTestId('stop-reason');
const box = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!;

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

/** A shot that runs, gets the sequencer's frame for `reason`, and ends. */
async function shotStoppedFor(page: Page, reason: string, kind = 'stop') {
  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  gateway.sendStop(reason, kind);
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
}

for (const [reason, words] of [
  ['targetWeight', 'stopped at the target weight'],
  ['targetVolume', 'stopped at the target volume'],
  ['appStop', 'stopped by hand'],
  ['machineEnded', 'ended by the machine'],
] as const) {
  test(`a shot the sequencer stopped for ${reason} says '${words}' under its time and weight`, async ({ page }) => {
    await home(page);
    await shotStoppedFor(page, reason);
    await expect(line(page)).toHaveText(words);
    await expect(line(page)).toHaveClass(/hint/);
    // Under the weight, over the values, inside the column.
    const weight = await box(page, 'shot-weight');
    const at = await box(page, 'stop-reason');
    expect(at.y).toBeGreaterThanOrEqual(weight.y + weight.height - 1);
    expect(at.y + at.height).toBeLessThanOrEqual((await box(page, 'shot-pressure')).y + 1);
    const column = await box(page, 'shot-column');
    expect(at.x + at.width).toBeLessThanOrEqual(column.x + column.width + 1);
    await page.screenshot({ path: `docs/product/stop-reason-${reason}.png` });
  });
}

test("the skin's stop is 'stopped by hand', and the line is gone when the next shot starts", async ({ page }) => {
  await home(page);
  await gateway.replay(page, 0, 0.6);
  await expect(line(page)).toHaveText('');
  // The values do not move when the line comes: it keeps its height while empty.
  const pressure = await box(page, 'shot-pressure');
  await page.getByTestId('stop').click();
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(line(page)).toHaveText('stopped by hand');
  expect((await box(page, 'shot-pressure')).y).toBeCloseTo(pressure.y, 0);
  await page.screenshot({ path: 'docs/product/stop-reason-apiStop.png' });

  // The next shot: no line while it runs, nor after it without a stop frame of its own.
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  await expect(line(page)).toHaveText('');
  await gateway.replay(page, 0.3, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await page.waitForTimeout(300);
  await expect(line(page)).toHaveText('');
});

test('no line for the other reasons, the backstop, an abnormal end, or a stop frame of another shot', async ({ page }) => {
  await home(page);
  await gateway.replay(page, 0, 0.6);
  for (const [kind, reason] of [
    ['advance', 'profileAdvance'],
    ['advance', 'profileSkip'],
    ['terminal', 'error'],
  ]) {
    gateway.sendStop(reason, kind);
  }
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  gateway.sendStop('stoppingBackstop', 'finalize');
  await page.waitForTimeout(300);
  await expect(line(page)).toHaveText('');
  await page.screenshot({ path: 'docs/product/stop-reason-none.png' });
});

test('a shot recalled from the history and the newest record after a reload have no line', async ({ page }) => {
  gateway.addShot('shot-1', '2026-10-12T08:00:00.000000', profile('A-Flow / default-light', 48, 9), {
    coffeeName: 'Red Brick',
    coffeeRoaster: 'Square Mile',
    targetYield: 48,
    grinderSetting: '4.8',
  });
  await home(page);
  await shotStoppedFor(page, 'targetWeight');
  await expect(line(page)).toHaveText('stopped at the target weight');

  // The history's entry lies over the finished shot: no line.
  await page.getByTestId('history-handle').tap();
  await page.getByTestId('history-entry').first().tap();
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'recalled');
  await expect(line(page)).toHaveText('');

  // After a reload home shows the newest record: no line, even when the feed names its stop.
  await page.reload();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  gateway.sendStop('targetWeight', 'stop', 'shot-1');
  await page.waitForTimeout(300);
  await expect(line(page)).toHaveText('');
});
