import { expect, test, type Page } from '@playwright/test';
import { measurementsOf, mockGateway, profile } from './mock-gateway';

// Home's graph after a start, a reconnect, a wake and the page becoming visible again: when home
// has no shot of its own it shows the newest shot record from Decaid; a shot it keeps stays.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const medium = profile('A-Flow / default-medium', 36, 3);
const timer = async (page: Page) => parseFloat((await page.getByTestId('shot-timer').textContent())!);

/** The tablet's screen goes off and on: the page is hidden, then visible again. */
async function screenOffOn(page: Page) {
  for (const state of ['hidden', 'visible']) {
    await page.evaluate((visibility) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  }
}

test('home shows the newest shot after a start, a reload, a sleep with a reconnect and the screen on again', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.addShot('shot-1', '2026-10-24T07:00:00.000000', medium, { targetYield: 36 });
  gateway.measurements['shot-1'] = measurementsOf(20);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // The start: the newest record, not the empty graph.
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  // The graph starts when water moves, so a record's time is a few seconds under its length.
  const first = await timer(page);
  expect(first).toBeGreaterThan(10);

  // A page the tablet froze and reloads starts with no shot of its own: the newest again.
  await page.reload();
  await expect(page.getByTestId('last-shot')).toBeVisible();
  expect(await timer(page)).toBe(first);

  // The machine sleeps, the gateway drops its sockets, a shot is made at the machine meanwhile,
  // the machine wakes and the sockets open again: the newer shot.
  gateway.state = 'sleeping';
  await expect(page.getByTestId('asleep')).toBeVisible();
  gateway.dropStreams();
  gateway.addShot('shot-2', '2026-10-24T08:00:00.000000', medium, { targetYield: 36 });
  gateway.measurements['shot-2'] = measurementsOf(30);
  await page.getByTestId('asleep').dispatchEvent('pointerdown');
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  await expect.poll(() => timer(page)).toBeCloseTo(first + 10, 0);

  // The screen off and on: the page visible again reads the newest one.
  gateway.addShot('shot-3', '2026-10-24T09:00:00.000000', medium, { targetYield: 36 });
  gateway.measurements['shot-3'] = measurementsOf(15);
  await screenOffOn(page);
  await expect.poll(() => timer(page)).toBeCloseTo(first - 5, 0);

  // A shot pulled here is kept: a sleep, a reconnect and the screen on do not replace it.
  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('shot-phases')).toBeVisible();
  const kept = await timer(page);
  expect(kept).toBeGreaterThan(first + 10);
  gateway.addShot('shot-4', '2026-10-24T10:00:00.000000', medium, { targetYield: 36 });
  gateway.measurements['shot-4'] = measurementsOf(10);
  gateway.dropStreams();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await screenOffOn(page);
  await page.waitForTimeout(500);
  expect(await timer(page)).toBe(kept);
  await expect(page.getByTestId('shot-phases')).toBeVisible();
  expect(gateway.calls('GET', '/api/v1/shots/shot-4')).toEqual([]);
  expect(errors).toEqual([]);
});
