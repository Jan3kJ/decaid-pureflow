import { expect, test, type Locator, type Page } from '@playwright/test';
import { MEASUREMENTS, espressoShare, measurementsFrom, measurementsOf, mockGateway, shotEvents } from './mock-gateway';

// The espresso graph of the founder's review of 2026-10-17 (spec 3.8, T1; acceptance 27): the
// scale ends at 10 and opens to 12 only for a value over 10, the live shot ends at its first
// frame after the pour (no tail, the timer stands), as the history's graph of the same shot,
// and the running time axis starts at the shot's expected length.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const svg = (scope: Page | Locator) => scope.getByTestId('shot-graph');
const attribute = async (scope: Page | Locator, name: string) => Number(await svg(scope).getAttribute(name));
const ticks = async (scope: Page | Locator) =>
  (await svg(scope).locator('text.tick:not(.temperature)').allTextContents()).map(Number);
const timer = async (page: Page) => parseFloat((await page.getByTestId('shot-timer').textContent())!);

/** The recorded shot's measurements, each `factor` times as far from the first: a longer shot. */
function stretched(factor: number) {
  const start = Date.parse(`${MEASUREMENTS[0].machine.timestamp.slice(0, 23)}Z`);
  return MEASUREMENTS.map((measurement) => {
    const at = Date.parse(`${measurement.machine.timestamp.slice(0, 23)}Z`);
    const timestamp = new Date(start + (at - start) * factor).toISOString().replace('Z', '000');
    return { ...measurement, machine: { ...measurement.machine, timestamp } };
  });
}

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

test('a shot that stays at or under 10 bar has a scale to 10, live and afterwards', async ({ page }) => {
  const gateway = await mockGateway(page);
  // An earlier shot of the profile, as long as this one: the running axis starts at 30 s.
  gateway.addShot('shot-before', '2026-10-18T08:00:00.000000', gateway.workflow.profile, gateway.workflow.context);
  await home(page);
  await expect.poll(() => gateway.calls('GET', '/api/v1/shots/shot-before').length).toBeGreaterThan(0);
  // Before any shot, home's empty graph has the shot's scale too.
  expect(await attribute(page.getByTestId('empty-graph'), 'data-scale')).toBe(10);

  await gateway.replay(page, 0, 0.7);
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  await expect.poll(() => attribute(page, 'data-points')).toBeGreaterThan(100);
  expect(await attribute(page, 'data-scale')).toBe(10);
  expect(await ticks(page)).toEqual([0, 2, 4, 6, 8, 10]);
  expect(await attribute(page, 'data-seconds')).toBe(30);
  await page.screenshot({ path: 'docs/product/espresso-during.png' });

  await gateway.replay(page, 0.7, 1);
  await page.getByTestId('shot-close').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const last = page.getByTestId('last-shot');
  expect(await attribute(last, 'data-scale')).toBe(10);
  expect(await ticks(last)).toEqual([0, 2, 4, 6, 8, 10]);
  expect(errors).toEqual([]);
});

test('a shot that goes over 10 bar opens the scale to 12 when it does', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  // The recording's 10 bar times 1.15: 11.5 bar, from 63 % of the shot on.
  await gateway.replay(page, 0, 0.5, { pressure: 1.15 });
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  await expect.poll(() => attribute(page, 'data-points')).toBeGreaterThan(50);
  expect(await attribute(page, 'data-scale')).toBe(10);

  await gateway.replay(page, 0.5, 0.8, { pressure: 1.15 });
  await expect(svg(page)).toHaveAttribute('data-scale', '12');
  expect(await ticks(page)).toEqual([0, 2, 4, 6, 8, 10, 12]);

  await gateway.replay(page, 0.8, 1, { pressure: 1.15 });
  await page.getByTestId('shot-close').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(await attribute(page.getByTestId('last-shot'), 'data-scale')).toBe(12);
  expect(errors).toEqual([]);
});

test('the live shot ends at the pour: the tail adds no points, the timer stands, and the history draws the same length', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await home(page);
  const tail = { tail: 5 };

  // The shot up to its last frame of the pour.
  await gateway.replay(page, 0, espressoShare(), tail);
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  await expect.poll(() => timer(page)).toBeGreaterThan(25);
  const points = await attribute(page, 'data-points');
  const seconds = await timer(page);

  // 5 s of the real DE1's tail: still espresso, but nothing moves on screen.
  await gateway.replay(page, espressoShare(), espressoShare(tail), tail);
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  await page.waitForTimeout(700);
  expect(await attribute(page, 'data-points')).toBe(points);
  expect(await timer(page)).toBe(seconds);
  // The graph is finished: it fills the width, its time axis ends at the shot's end.
  expect(await attribute(page, 'data-seconds')).toBeCloseTo(seconds, 1);
  await page.screenshot({ path: 'docs/product/espresso-after.png' });

  // The machine leaves espresso: home's last shot is the same graph.
  await gateway.replay(page, espressoShare(tail), 1, tail);
  await page.getByTestId('shot-close').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const last = page.getByTestId('last-shot');
  expect(await attribute(last, 'data-points')).toBe(points);
  expect(parseFloat((await page.getByTestId('last-shot-time').textContent())!)).toBeCloseTo(seconds, 1);

  // The same shot from the history, its record with the tail: the same length within 1 s.
  gateway.addShot('shot-tail', '2026-10-19T08:00:00.000000', gateway.workflow.profile, gateway.workflow.context);
  gateway.measurements['shot-tail'] = measurementsFrom(shotEvents(tail));
  await page.getByTestId('nav-history').tap();
  await page.getByTestId('history-entry').first().tap();
  const recalled = page.getByTestId('history-graph');
  await expect(recalled).toBeVisible();
  await expect.poll(() => attribute(recalled, 'data-points')).toBeGreaterThan(0);
  expect(Math.abs((await attribute(recalled, 'data-seconds')) - seconds)).toBeLessThan(1);
  expect(Math.abs((await attribute(recalled, 'data-points')) - points)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("the running time axis starts at the last shot's length with the profile and is not rescaled under it", async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  // A shot with the workflow's profile, the recording at half speed: 55 s from the water on, so 60 s.
  gateway.addShot('shot-50', '2026-10-18T08:00:00.000000', gateway.workflow.profile, gateway.workflow.context);
  gateway.measurements['shot-50'] = stretched(2);
  // A newer one with another title does not count.
  gateway.addShot('shot-other', '2026-10-18T09:00:00.000000', { ...gateway.workflow.profile, title: 'Other' }, null);
  gateway.measurements['shot-other'] = measurementsOf(12);
  await home(page);
  await expect.poll(() => gateway.calls('GET', '/api/v1/shots/shot-50').length).toBeGreaterThan(0);

  for (const [from, to] of [
    [0, 0.05],
    [0.05, 0.4],
    [0.4, 0.8],
    [0.8, espressoShare()],
  ]) {
    await gateway.replay(page, from, to);
    await expect(page.getByTestId('shot-overlay')).toBeVisible();
    expect(await attribute(page, 'data-seconds')).toBe(60);
  }
  await gateway.replay(page, espressoShare(), 1);
  await expect(page.getByTestId('screen-home')).toBeVisible();

  // That shot (27 s) is now the last one with the profile: the next starts at 30 s.
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  expect(await attribute(page, 'data-seconds')).toBe(30);
  expect(errors).toEqual([]);
});

test("without a shot of the profile the axis starts at the profile's estimate", async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  // The mock's profile: 9 pressure steps of 11 to 19 s, 135 s in the step editor's curve.
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  expect(await attribute(page, 'data-seconds')).toBe(140);
  expect(errors).toEqual([]);
});
