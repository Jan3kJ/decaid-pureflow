import { expect, test } from '@playwright/test';
import { recordSteamFrame, type SteamRun } from '../src/steam/run';
import { EXPORT_STEAMS, mockGateway, type MockGateway } from './mock-gateway';
import { back, swipe, toPage } from './touch';

// The steam page against a mocked gateway (D8a, acceptance item 4): the scale's frames are
// the mock's, because the simulated scale's weight cannot be set (research.md 8.7). The
// founder agreed to this way of testing on 2026-10-13 (request 168).

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The bodies of the workflow writes, in order. */
const written = (gateway: MockGateway) => gateway.calls('PUT', '/api/v1/workflow').map((call) => call.body);

// With the founder's defaults: mugs 150, 225 and 275 g, 26 s for 180 g of milk.
const MUGS = [
  { name: 'a small mug', weight: 300, size: 's', mug: '150 g', milk: '150 g', seconds: 22 },
  { name: 'a medium mug', weight: 525, size: 'm', mug: '225 g', milk: '300 g', seconds: 43 },
  { name: 'a large mug', weight: 725.4, size: 'l', mug: '275 g', milk: '450.4 g', seconds: 65 },
];

for (const mug of MUGS) {
  test(`${mug.name} with milk on the scale: the size, the milk and the seconds, and 'set timer' writes them`, async ({ page }) => {
    const gateway = await mockGateway(page);
    await page.goto('/');
    await toPage(page, 'steam');
    await expect(page.getByTestId('screen-steam')).toBeVisible();
    // The timer the machine has.
    await expect(page.getByTestId('steam-timer')).toHaveText('50s');

    gateway.putOnScale(mug.weight);
    await expect(page.getByTestId('steam-weight')).toHaveText(`${mug.weight.toFixed(1)} g`);
    await expect(page.getByTestId('steam-mug')).toHaveText(mug.size);
    await expect(page.getByTestId('steam-mug-weight')).toHaveText(mug.mug);
    await expect(page.getByTestId('steam-milk')).toHaveText(mug.milk);
    await expect(page.getByTestId('steam-seconds')).toHaveText(`${mug.seconds} s`);
    // Nothing is written before the tap.
    expect(written(gateway)).toEqual([]);

    await page.getByTestId('steam-set-timer').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${mug.seconds}s`);
    expect(written(gateway)).toEqual([{ steamSettings: { duration: mug.seconds } }]);
    expect(gateway.workflow.steamSettings).toEqual({
      targetTemperature: 150,
      duration: mug.seconds,
      flow: 0.8,
      stopAtTemperature: 0,
    });
    expect(errors).toEqual([]);
  });
}

test('the mug follows the scale, and an empty scale offers no timer', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');

  await expect(page.getByTestId('steam-weight')).toHaveText('0.0 g');
  await expect(page.getByTestId('steam-mug')).toHaveText('s');
  await expect(page.getByTestId('steam-milk')).toHaveText('0 g');
  await expect(page.getByTestId('steam-set-timer')).toBeDisabled();
  await expect(page.getByTestId('steam-seconds')).toHaveCount(0);

  // The midpoints of the founder's defaults (spec 3.4): above 412.5 g it is the medium mug,
  // above 625 g the large one.
  const borders = [
    [412.5, 's'],
    [412.6, 'm'],
    [625, 'm'],
    [625.1, 'l'],
    [150, 's'],
  ] as const;
  for (const [weight, size] of borders) {
    gateway.putOnScale(weight);
    await expect(page.getByTestId('steam-weight')).toHaveText(`${weight.toFixed(1)} g`);
    await expect(page.getByTestId('steam-mug')).toHaveText(size);
  }
  // An empty small mug: no milk, nothing to set.
  await expect(page.getByTestId('steam-set-timer')).toBeDisabled();
  expect(written(gateway)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a favourite chip writes its seconds directly, without a scale weight', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');

  const chips = page.getByTestId('steam-favourite');
  await expect(chips).toHaveText(['25 s', '50 s', '30 s']);
  // The chip of the machine's timer is marked.
  await expect(chips.nth(1)).toContainClass('on');

  await chips.nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  await expect(chips.nth(0)).toContainClass('on');
  await chips.nth(2).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');
  expect(written(gateway)).toEqual([{ steamSettings: { duration: 25 } }, { steamSettings: { duration: 30 } }]);
  expect(errors).toEqual([]);
});

// The founder's test of 2026-10-13: a favourite of 25 s was followed by 30 s of steam. The
// workflow's duration is not the machine's timer (research.md, section 16).

test("the timer on screen is the machine's, and a chip writes the machine when the workflow already had its seconds", async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  // The workflow says 25 s, the machine holds 30 s: Decaid passes a workflow write on only when the value changes.
  gateway.workflow.steamSettings.duration = 25;
  gateway.shotSettings.targetSteamDuration = 30;
  await page.goto('/');
  await toPage(page, 'steam');

  const chips = page.getByTestId('steam-favourite');
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');
  await expect(chips.nth(2)).toContainClass('on');

  await chips.nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  await expect(chips.nth(0)).toContainClass('on');
  expect(written(gateway)).toEqual([{ steamSettings: { duration: 25 } }]);
  // The whole frame of the machine's settings, with the new timer.
  expect(gateway.calls('POST', '/api/v1/machine/shotSettings').map((call) => call.body)).toEqual([
    { ...gateway.shotSettings, targetSteamDuration: 25 },
  ]);
  expect(gateway.shotSettings.targetSteamDuration).toBe(25);
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('with Streamline open and remembering 30 s, a chip of 25 s and the timer from the milk both stay', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.streamlineOpen = true;
  gateway.store['streamline-app/last-steam-duration'] = 30;
  gateway.setMachineSteamTimer(50);
  // Streamline has written its 30 s over the 50 s.
  expect(gateway.shotSettings.targetSteamDuration).toBe(30);
  await page.goto('/');
  await toPage(page, 'steam');
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');

  await page.getByTestId('steam-favourite').nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  expect(gateway.store['streamline-app/last-steam-duration']).toBe(25);

  gateway.putOnScale(525);
  await page.getByTestId('steam-set-timer').click();
  await expect(page.getByTestId('steam-timer')).toHaveText('43s');
  expect(gateway.store['streamline-app/last-steam-duration']).toBe(43);
  // Both ways write the same call, and the machine keeps what they wrote.
  expect(written(gateway)).toEqual([{ steamSettings: { duration: 25 } }, { steamSettings: { duration: 43 } }]);
  expect(gateway.shotSettings.targetSteamDuration).toBe(43);
  expect(gateway.workflow.steamSettings.duration).toBe(43);
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a timer another app changes afterwards is shown with a notice, until it is set again', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  // No store key of Streamline: the skin does not create one.
  await page.getByTestId('steam-favourite').nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  expect(gateway.store).toEqual({});
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);

  gateway.setMachineSteamTimer(30);
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');
  await expect(page.getByTestId('steam-mismatch')).toContainText("The machine's timer is 30 s, not the 25 s set here");

  await page.getByTestId('steam-favourite').nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the steam settings come from the settings store and survive a reload', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'pureflow.settings',
      JSON.stringify({ steam: { mugSmall: 100, referenceSeconds: 30, referenceMilk: 100, favourites: [10, 20, 40] } }),
    );
  });
  // The skin reads the store once, when it loads; afterwards the settings page changes it.
  await page.reload();
  await toPage(page, 'steam');
  gateway.putOnScale(200);

  for (const reload of [false, true]) {
    // After the reload the steam screen is the one the skin opens with.
    if (reload) await page.reload();
    await expect(page.getByTestId('steam-favourite')).toHaveText(['10 s', '20 s', '40 s']);
    await expect(page.getByTestId('steam-mug-weight')).toHaveText('100 g');
    await expect(page.getByTestId('steam-milk')).toHaveText('100 g');
    await expect(page.getByTestId('steam-seconds')).toHaveText('30 s');
  }
  expect(errors).toEqual([]);
});

test('steam started at the machine shows its graph of pressure, flow and temperature, and stops from the page', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.putOnScale(525);
  await page.getByTestId('steam-set-timer').click();
  await expect(page.getByTestId('steam-timer')).toHaveText('43s');

  await expect(page.getByTestId('shot-graph')).toHaveAttribute('data-points', '0');
  // Steam is started at the machine: the page offers no start, and no stop before a frame says steam.
  await expect(page.getByRole('button', { name: /start/ })).toHaveCount(0);
  await expect(page.getByTestId('steam-stop')).toHaveCount(0);
  // The machine's state line, as on home.
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('state-steam')).toHaveText('148 °C');
  await expect(page.getByTestId('state-tank')).toHaveText('1040 ml');
  await expect(page.getByTestId('state-scale')).toHaveText('525.0 g');

  gateway.steamFor(18);
  await expect(page.getByTestId('status-title')).toHaveText('Steam');
  await expect(page.getByTestId('steam-stop')).toBeVisible();
  await expect(page.getByTestId('steam-state')).toContainText('steaming');
  expect(Number(await page.getByTestId('shot-graph').getAttribute('data-points'))).toBeGreaterThanOrEqual(72);
  for (const line of ['pressure', 'flow', 'temperature']) {
    expect((await page.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(100);
  }
  // Steam has no weight line and no targets.
  await expect(page.getByTestId('shot-line-weight-flow')).toHaveCount(0);
  await expect(page.locator('[data-testid^="shot-target-"]')).toHaveCount(0);
  // The steam screen stays: only espresso opens a screen by itself.
  await expect(page.getByTestId('screen-steam')).toBeVisible();

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const outside = [...document.querySelectorAll('button, dl, header, aside, svg')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5);
    });
    return { scrolls: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight, outside: outside.length };
  });
  expect(overflow).toEqual({ scrolls: false, outside: 0 });
  await page.screenshot({ path: 'docs/product/steam.png' });

  await page.getByTestId('steam-stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  gateway.state = 'idle';
  await expect(page.getByTestId('steam-stop')).toHaveCount(0);
  // The finished graph stays until the next steam.
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  expect(Number(await page.getByTestId('shot-graph').getAttribute('data-points'))).toBeGreaterThanOrEqual(72);
  expect(errors).toEqual([]);
});

/** The points of a path's `d`: x and y in pixels. */
const points = (d: string) => [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((match) => ({ x: +match[1], y: +match[2] }));

// Spec 3.12 'Steam graph: the flow' (Y11): a real DE1's steam from the founder's export.
test('a finished steam draws its flow in blue on the scale of pressure, ending where the run ends, with the legend', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  await expect(page.getByTestId('shot-graph')).toHaveAttribute('data-points', '0');

  gateway.steamReplay(0);
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  let run: SteamRun | null = null;
  for (const { timestamp, state, substate, ...values } of EXPORT_STEAMS[0].frames) {
    run = recordSteamFrame(run, { ...gateway.frame(), timestamp, state: { state, substate }, ...values });
  }
  const series = run!.series;
  const graph = page.getByTestId('shot-graph');
  await expect(graph).toHaveAttribute('data-points', String(series.t.length));
  await expect(graph).toHaveAttribute('data-scale', '4');
  await expect(page.getByTestId('shot-tick-temperature')).toHaveText(['140', '170']);
  await expect(page.getByTestId('shot-unit-main')).toHaveText('bar · ml/s');
  const flow = page.getByTestId('shot-line-flow');
  // Blue, the app's --flow (#4da3ff).
  await expect(flow).toHaveCSS('stroke', 'rgb(77, 163, 255)');
  await expect(page.locator('[data-testid^="shot-target-"]')).toHaveCount(0);

  // One point a frame of the run; the flow ends with the run, as pressure and temperature do.
  const line = async (name: string) => points((await page.getByTestId(`shot-line-${name}`).getAttribute('d'))!);
  const flowPoints = await line('flow');
  expect(flowPoints).toHaveLength(series.t.length);
  for (const other of ['pressure', 'temperature']) expect((await line(other)).at(-1)!.x).toBeCloseTo(flowPoints.at(-1)!.x, 1);
  // The scale is the pressure's: the peak of about 3.6 ml/s near the top, the last point low, falling.
  const base = Math.max(...flowPoints.map((point) => point.y));
  const peak = Math.min(...flowPoints.map((point) => point.y));
  const last = series.flow.at(-1)!;
  expect(last).toBeGreaterThanOrEqual(0.5);
  expect(last).toBeLessThan(Math.max(...series.flow) / 2);
  expect(flowPoints.at(-1)!.y).toBeGreaterThan(peak + (base - peak) / 2);

  // The legend (on by default) names the three curves.
  await expect(page.getByTestId('shot-legend').locator('li')).toHaveText(['flow', 'pressure', 'temperature']);
  await page.screenshot({ path: 'docs/product/steam-flow.png' });

  // With the setting off there is none; the curves stay.
  await page.evaluate(() => localStorage.setItem('pureflow.settings', JSON.stringify({ showGraphLegend: false })));
  await page.reload();
  await toPage(page, 'steam');
  gateway.steamReplay(1);
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  await expect(page.getByTestId('shot-line-flow')).toHaveCount(1);
  await expect(page.getByTestId('shot-legend')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// The founder's review of 2026-10-16 (spec 3.7, acceptance item 17).

test('a selected adjust button adds its amount to the calculated timer and to a favourite, and the seconds written include it', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.putOnScale(525);
  await expect(page.getByTestId('steam-seconds')).toHaveText('43 s');

  // The defaults, none selected.
  const adjust = page.getByTestId('steam-adjust');
  const selected = page.locator('[data-testid="steam-adjust"][aria-pressed="true"]');
  await expect(adjust).toHaveText(['−8 s', '−4 s', '+5 s']);
  await expect(selected).toHaveCount(0);
  await expect(page.getByTestId('steam-favourite')).toHaveText(['25 s', '50 s', '30 s']);

  // +5 s: the calculated 43 s become 48 s, the favourites 30, 55 and 35 s. The selection writes nothing.
  await adjust.nth(2).click();
  await expect(adjust.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('steam-seconds')).toHaveText('48 s');
  await expect(page.getByTestId('steam-favourite')).toHaveText(['30 s', '55 s', '35 s']);
  expect(written(gateway)).toEqual([]);
  await page.getByTestId('steam-set-timer').click();
  await expect(page.getByTestId('steam-timer')).toHaveText('48s');
  expect(gateway.shotSettings.targetSteamDuration).toBe(48);

  // One at a time: −8 s replaces +5 s; the favourite of 25 s sends 17 s.
  await adjust.nth(0).click();
  await expect(selected).toHaveCount(1);
  await expect(page.getByTestId('steam-seconds')).toHaveText('35 s');
  await page.getByTestId('steam-favourite').nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('17s');
  await expect(page.getByTestId('steam-favourite').nth(0)).toHaveClass(/on/);

  // A tap on the selected one clears it.
  await adjust.nth(0).click();
  await expect(selected).toHaveCount(0);
  await expect(page.getByTestId('steam-seconds')).toHaveText('43 s');
  expect(written(gateway)).toEqual([{ steamSettings: { duration: 48 } }, { steamSettings: { duration: 17 } }]);
  expect(gateway.shotSettings.targetSteamDuration).toBe(17);
  expect(errors).toEqual([]);
});

test('the adjust amounts come from the settings, and the settings page changes them, below 0 too', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('pureflow.settings', JSON.stringify({ steam: { adjustments: [-3, 2, 10] } }));
  });
  await page.reload();
  await toPage(page, 'steam');
  await expect(page.getByTestId('steam-adjust')).toHaveText(['−3 s', '+2 s', '+10 s']);
  gateway.putOnScale(525);
  await page.getByTestId('steam-adjust').nth(2).click();
  await expect(page.getByTestId('steam-seconds')).toHaveText('53 s');

  // The settings page, category Steam: −6 s typed on the number pad with its sign key.
  await back(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('setting-adjust-1')).toContainText('-3');
  await page.getByTestId('setting-adjust-1').click();
  await expect(page.getByTestId('numpad-range')).toHaveText('-60 to 60 s');
  await page.getByTestId('numpad-key-6').click();
  await page.getByTestId('numpad-key-sign').click();
  await expect(page.getByTestId('numpad-display')).toHaveText('-6');
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('setting-adjust-1')).toContainText('-6');
  await back(page);
  await toPage(page, 'steam');
  await expect(page.getByTestId('steam-adjust')).toHaveText(['−6 s', '+2 s', '+10 s']);
  expect(errors).toEqual([]);
});

test("while steam runs the timer counts down; after the steam the graph adds no points, its time is the steam's, and the selection is cleared", async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.putOnScale(525);
  await page.getByTestId('steam-adjust').nth(2).click();
  await page.getByTestId('steam-set-timer').click();
  await expect(page.getByTestId('steam-timer')).toHaveText('48s');
  // The temperature axis of the steam graph (spec 3.7).
  await expect(page.getByTestId('shot-tick-temperature')).toHaveText(['140', '170']);

  // 10 s of steam: 38 s are left, then fewer as the machine's frames go on.
  gateway.steamFor(10);
  await expect(page.getByTestId('steam-state')).toContainText('steaming');
  const left = async () => parseInt((await page.getByTestId('steam-timer').textContent())!, 10);
  await expect.poll(left).toBeLessThanOrEqual(38);
  const first = await left();
  expect(first).toBeGreaterThanOrEqual(35);
  await expect.poll(left, { timeout: 5000 }).toBeLessThan(first);

  // The real DE1 stays in state steam while it purges: the steam has ended there.
  gateway.substate = 'puffing';
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  const points = (await page.getByTestId('shot-graph').getAttribute('data-points'))!;
  const elapsed = (await page.getByTestId('steam-elapsed').textContent())!;
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('shot-graph')).toHaveAttribute('data-points', points);
  await expect(page.getByTestId('steam-elapsed')).toHaveText(elapsed);
  // The page shows the set timer again, and the selection of +5 s is gone.
  await expect(page.getByTestId('steam-timer')).toHaveText('48s');
  await expect(page.locator('[data-testid="steam-adjust"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByTestId('steam-seconds')).toHaveText('43 s');

  gateway.substate = null;
  gateway.state = 'idle';
  await page.waitForTimeout(700);
  await expect(page.getByTestId('shot-graph')).toHaveAttribute('data-points', points);
  await expect(page.getByTestId('steam-elapsed')).toHaveText(elapsed);
  expect(errors).toEqual([]);
});

test("while steam runs a tap on an adjust button moves the machine's timer and 'steam left' by the change it makes (spec 3.17 item 8)", async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  const adjust = page.getByTestId('steam-adjust');
  await expect(adjust).toHaveText(['−8 s', '−4 s', '+5 s']);
  await page.getByTestId('steam-favourite').nth(2).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');

  // No steam: a tap selects and writes nothing (spec 3.7).
  await adjust.nth(2).click();
  await adjust.nth(2).click();
  await expect(page.locator('[data-testid="steam-adjust"][aria-pressed="true"]')).toHaveCount(0);

  // 10 s of steam (its last frame at 10 s), held: 20 s are left.
  gateway.steamFor(10.25, true);
  await expect(page.getByTestId('steam-timer')).toHaveText('20s');
  // none to +5 s adds 5, +5 s to −4 s adds −9, −4 s tapped again takes −4 off
  await adjust.nth(2).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  await adjust.nth(1).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('16s');
  await expect(adjust.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await adjust.nth(1).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('20s');
  expect(written(gateway)).toEqual([30, 35, 26, 30].map((duration) => ({ steamSettings: { duration } })));
  expect(gateway.shotSettings.targetSteamDuration).toBe(30);

  // When the steam ends the selection is cleared and the page shows the timer.
  await adjust.nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('12s');
  gateway.waterEnded();
  await expect(page.locator('[data-testid="steam-adjust"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByTestId('steam-timer')).toHaveText('22s');
  expect(errors).toEqual([]);
});

test('a swipe to the left opens the steam page, from the right edge too (spec 3.7, 3.8)', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // Down along the edge: nothing.
  await swipe(page, { x: 1250, y: 200 }, { x: 1220, y: 600 });
  await page.waitForTimeout(400);
  await expect(page.getByTestId('screen-home')).toBeVisible();

  await swipe(page, { x: 1180, y: 400 }, { x: 760, y: 420 });
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await back(page);
  await swipe(page, { x: 700, y: 400 }, { x: 400, y: 400 });
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  // The history's swipe still opens the history, not a page.
  await back(page);
  await swipe(page, { x: 10, y: 400 }, { x: 260, y: 420 });
  await expect(page.getByTestId('history')).toBeVisible();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.writes()).toEqual([]);
  expect(errors).toEqual([]);
});

test("the steam page's tare button tares the scale, and without one looks for it (spec 3.9)", async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.putOnScale(300);
  await expect(page.getByTestId('steam-weight')).toHaveText('300.0 g');
  await page.getByTestId('steam-tare').click();
  await expect(page.getByTestId('steam-weight')).toHaveText('0.0 g');
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(1);

  gateway.connectScale(false);
  await expect(page.getByTestId('steam-weight')).toHaveText('–');
  await page.getByTestId('steam-tare').click();
  await expect.poll(() => gateway.calls('GET', '/api/v1/devices/scan').length).toBe(1);
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('with the steam heater off Steam on sits in the header left of the title and switches it on; the column does not move (spec 3.12 item 8)', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await toPage(page, 'steam');
  const screen = page.getByTestId('screen-steam');
  await expect(page.getByTestId('steam-favourite')).toHaveCount(3);
  await expect(page.getByTestId('steam-heater-on')).toHaveCount(0);
  // No state dot on the left edge (spec 3.9 item 12): the state line says it.
  await expect(page.getByTestId('nav-status')).toHaveCount(0);
  await expect(page.locator('.page:not([inert]) nav span')).toHaveCount(0);
  const timerOn = (await page.getByTestId('steam-timer').boundingBox())!;
  const favouriteOn = (await page.getByTestId('steam-favourite').first().boundingBox())!;
  const headerOn = (await screen.locator('.page-header').boundingBox())!;

  // Another client switches the heater off: the machine's own target is 0.
  gateway.setMachineSteamTarget(0);
  const button = page.getByTestId('steam-heater-on');
  await expect(button).toBeVisible();
  await expect(screen.getByTestId('status-title')).toHaveText('Off');
  // The button is in the header row, left of the title, and the sentence is gone.
  await expect(screen.locator('.page-header').getByTestId('steam-heater-on')).toHaveCount(1);
  await expect(page.getByText('The steam heater is off')).toHaveCount(0);
  const box = (await button.boundingBox())!;
  const title = (await screen.getByTestId('page-title').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(title.x);
  expect(box.y).toBeLessThan(title.y + title.height);
  expect(box.y + box.height).toBeGreaterThan(title.y);
  // The header does not grow and the right column keeps its place: favourites and timer as with the heater on.
  expect((await screen.locator('.page-header').boundingBox())!).toEqual(headerOn);
  await expect(page.getByTestId('steam-favourite')).toHaveCount(3);
  expect((await page.getByTestId('steam-favourite').first().boundingBox())!).toEqual(favouriteOn);
  expect((await page.getByTestId('steam-timer').boundingBox())!).toEqual(timerOn);
  await page.screenshot({ path: 'docs/product/steam-heater-off.png' });

  await button.click();
  await expect
    .poll(() =>
      gateway
        .calls('PUT', '/api/v1/workflow')
        .map((call) => call.body?.steamSettings)
        .filter(Boolean),
    )
    .toEqual([{ targetTemperature: 150 }]);
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(150);
  await expect(page.getByTestId('steam-heater-on')).toHaveCount(0);
  expect((await page.getByTestId('steam-timer').boundingBox())!).toEqual(timerOn);
  expect(errors).toEqual([]);
});

test('Steam on in the header says so when Decaid refuses it, and stays (spec 3.12 item 8)', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await toPage(page, 'steam');
  gateway.setMachineSteamTarget(0);
  await expect(page.getByTestId('steam-heater-on')).toBeVisible();
  await page.route('http://localhost:8080/api/v1/workflow', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: '{"error":"refused"}' }) : route.fallback(),
  );
  await page.getByTestId('steam-heater-on').click();
  await expect(page.getByTestId('screen-steam').getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('steam-heater-on')).toBeVisible();
  // the browser logs the refused request itself; nothing else
  expect(errors.filter((error) => !error.startsWith('Failed to load resource'))).toEqual([]);
});
