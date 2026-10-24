import { expect, test, type Locator, type Page } from '@playwright/test';
import { HEATING_SECONDS, SHOT_EVENTS, WATER_FRAMES, measurementsOf, mockGateway, profile } from './mock-gateway';
import { back } from './touch';

// The shot graph against a mocked gateway (the founder's notes of 2026-10-13): the heating
// before the water is cut, a stored shot fills the width, the profile's targets are dashed
// lines with their own quantity, every scale has its unit, and the legend is a setting.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The share of the replay before the first frame in which water moves. */
const HEATING_SHARE =
  SHOT_EVENTS.findIndex((event) => event.machine && event.machine.state.substate !== 'preparingForShot') / SHOT_EVENTS.length;

const box = async (locator: Locator) => (await locator.boundingBox())!;
const points = async (graph: Locator) => Number(await graph.getByTestId('shot-graph').getAttribute('data-points'));

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

test('a live shot starts its graph and timer when water moves, not while the machine heats', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);

  // Only the heating: espresso, and nothing drawn yet.
  await gateway.replay(page, 0, HEATING_SHARE);
  await expect(page.getByTestId('shot-plot')).toBeVisible();
  await expect(page.getByTestId('state-step')).toHaveCount(0);
  await expect(page.getByTestId('shot-graph')).toHaveAttribute('data-points', '0');
  await expect(page.getByTestId('shot-timer')).toHaveText('0.0s');

  // The water: the graph starts at 0 s with the first frame of preinfusion.
  await gateway.replay(page, HEATING_SHARE, 1);
  // The finished shot stays on home (spec 3.11).
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const last = page.getByTestId('last-shot');
  expect(await points(last)).toBeGreaterThanOrEqual(WATER_FRAMES);
  expect(await points(last)).toBeLessThan(WATER_FRAMES + 20);
  const seconds = parseFloat((await page.getByTestId('shot-timer').textContent())!);
  // The recording is 32 s in espresso, 4.5 s of them heating.
  expect(seconds).toBeGreaterThan(25);
  expect(seconds).toBeLessThan(32 - HEATING_SECONDS + 0.5);
  expect(errors).toEqual([]);
});

test('the targets are dashed lines with their quantity, every scale has its unit, and a finished shot fills the width', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await home(page);
  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const graph = page.getByTestId('last-shot');

  for (const target of ['pressure', 'flow', 'temperature']) {
    const line = graph.getByTestId(`shot-target-${target}`);
    expect((await line.getAttribute('d'))!.length).toBeGreaterThan(30);
    const style = await line.evaluate((element) => {
      const css = getComputedStyle(element);
      return { dashed: css.strokeDasharray !== 'none', stroke: css.stroke };
    });
    const curve = await graph.getByTestId(`shot-line-${target}`).evaluate((element) => getComputedStyle(element).stroke);
    expect(style).toEqual({ dashed: true, stroke: curve });
  }

  // The temperature target lies in the temperature lane, over the band of pressure and flow.
  const temperatureTarget = await box(graph.getByTestId('shot-target-temperature'));
  const mainUnit = await box(graph.getByTestId('shot-unit-main'));
  const temperatureUnit = await box(graph.getByTestId('shot-unit-temperature'));
  expect(temperatureTarget.y + temperatureTarget.height).toBeLessThan(mainUnit.y);
  expect(temperatureTarget.y).toBeGreaterThan(temperatureUnit.y);
  await expect(graph.getByTestId('shot-unit-temperature')).toHaveText('°C');
  // The weight flow shares the scale of flow and pressure, so that scale names g/s too
  // (founder, 2026-10-14); there is no scale in grams and no target weight on the graph.
  await expect(graph.getByTestId('shot-unit-main')).toHaveText('bar · ml/s · g/s');
  await expect(graph.getByTestId('shot-unit-weight-flow')).toHaveText('g/s');
  await expect(graph.getByTestId('shot-line-weight')).toHaveCount(0);
  await expect(graph.getByTestId('shot-target-weight')).toHaveCount(0);
  const weightFlow = graph.getByTestId('shot-line-weight-flow');
  expect((await weightFlow.getAttribute('d'))!.length).toBeGreaterThan(100);
  const colours = await weightFlow.evaluate((path) => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--weight)';
    document.body.append(probe);
    const weight = getComputedStyle(probe).color;
    probe.remove();
    return { stroke: getComputedStyle(path).stroke, weight };
  });
  expect(colours.stroke).toBe(colours.weight);
  // The recorded shot's weight flow peaks at about 2.3 g/s, under its flow's peak in ml/s:
  // on the shared scale the yellow curve stays under the top of the blue one.
  const [weightTop, flowTop] = await Promise.all(
    ['weight-flow', 'flow'].map((line) =>
      graph.getByTestId(`shot-line-${line}`).evaluate((path) => (path as SVGGraphicsElement).getBBox().y),
    ),
  );
  expect(weightTop).toBeGreaterThan(flowTop);

  // The finished shot's last point is at the right end of the plot.
  const plot = await graph
    .locator('line.grid')
    .first()
    .evaluate((line) => Number(line.getAttribute('x2')));
  const pressure = await graph.getByTestId('shot-line-pressure').evaluate((path) => {
    const bbox = (path as SVGGraphicsElement).getBBox();
    return bbox.x + bbox.width;
  });
  expect(Math.abs(pressure - plot)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('a shot without a scale has no weight flow: nothing yellow, no g/s', async ({ page }) => {
  const gateway = await mockGateway(page);
  // As on 2026-10-13, when the founder's scale did not connect: measurements without a weight.
  gateway.addShot('no-scale', '2026-10-12T08:00:00.000000', profile('A-Flow / default-light', 48, 9), { targetYield: 48 });
  gateway.measurements['no-scale'] = measurementsOf(60).map((measurement) => ({ ...measurement, scale: null }));
  await home(page);
  await page.getByTestId('history-handle').tap();
  await page.getByTestId('history-entry').first().tap();
  const graph = page.getByTestId('history-graph');
  await expect(graph.getByTestId('shot-line-pressure')).toHaveCount(1);
  await expect(graph.getByTestId('shot-line-weight-flow')).toHaveCount(0);
  await expect(graph.getByTestId('shot-unit-weight-flow')).toHaveCount(0);
  await expect(graph.getByTestId('shot-unit-main')).toHaveText('bar · ml/s');
  await expect(graph.getByTestId('shot-legend').locator('li')).toHaveText([
    'flow',
    'pressure',
    'temperature',
    "dashed: the profile's target",
  ]);
  expect(errors).toEqual([]);
});

test('a short shot from the history fills the graph, cut at the water as the live one', async ({ page }) => {
  const gateway = await mockGateway(page);
  // 15 s from the water on: the recording ended early.
  gateway.addShot('short', '2026-10-12T08:00:00.000000', profile('A-Flow / default-light', 48, 9), {
    coffeeName: 'Red Brick',
    coffeeRoaster: 'Square Mile',
    targetYield: 48,
  });
  gateway.measurements.short = measurementsOf(HEATING_SECONDS + 15);
  await home(page);
  await page.getByTestId('history-handle').tap();
  await page.getByTestId('history-entry').first().tap();
  const graph = page.getByTestId('history-graph');
  await expect(graph).toBeVisible();

  const seconds = Number(await graph.getByTestId('shot-graph').getAttribute('data-seconds'));
  expect(seconds).toBeGreaterThan(14);
  expect(seconds).toBeLessThan(15.5);
  const plot = await graph
    .locator('line.grid')
    .first()
    .evaluate((line) => Number(line.getAttribute('x2')));
  const right = await graph.getByTestId('shot-line-flow').evaluate((path) => {
    const bbox = (path as SVGGraphicsElement).getBBox();
    return bbox.x + bbox.width;
  });
  expect(Math.abs(right - plot)).toBeLessThan(3);
  // The time axis counts in fives for a shot this short.
  await expect(graph.locator('text.time')).toHaveText(['0 s', '5', '10', '15'].slice(0, seconds >= 15 ? 4 : 3));
  expect(errors).toEqual([]);
});

test('the legend is under the graph by default, and the settings page switches it off for every graph', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await gateway.replay(page, 0, 0.5);
  const legend = page.getByTestId('shot-legend');
  await expect(legend).toBeVisible();
  await expect(legend.locator('li')).toHaveText([
    'flow',
    'pressure',
    'temperature',
    'weight flow (g/s)',
    "dashed: the profile's target",
  ]);
  // At the bottom left, under the plot.
  const plot = await box(page.getByTestId('shot-graph'));
  const shown = await box(legend);
  expect(shown.y).toBeGreaterThanOrEqual(plot.y + plot.height - 1);
  expect(shown.x).toBeLessThan(plot.x + plot.width / 4);
  await gateway.replay(page, 0.5, 1);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('last-shot').getByTestId('shot-legend')).toBeVisible();

  await page.getByTestId('menu').click();

  await page.getByTestId('open-settings').click();

  await page.getByTestId('settings-category-skin').click();
  const lever = page.getByTestId('setting-show-graph-legend');
  await expect(lever).toHaveAttribute('aria-checked', 'true');
  await lever.click();
  await expect(lever).toHaveAttribute('aria-checked', 'false');
  await back(page);
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await expect(page.getByTestId('shot-legend')).toHaveCount(0);

  // It is one stored setting: it survives a reload.
  await page.reload();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('setting-show-graph-legend')).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
});
