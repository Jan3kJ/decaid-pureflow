import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile } from './mock-gateway';
import { back, toPage } from './touch';

// Home is the shot screen: one graph and a right column
// of a fixed width in three states. Idle before a shot: the empty graph, the target yield and
// '–'. A shot runs: live curves and values, and stop. After it: the shot with Streamline's
// per-phase table stays until the next one starts. A recalled history entry has its caption
// and its dismiss chip.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

const box = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!;
const number = async (page: Page, testid: string) => parseFloat((await page.getByTestId(testid).textContent())!);

const cells = async (page: Page, phase: string) =>
  Object.fromEntries(
    await Promise.all(
      ['seconds', 'weight', 'volume', 'temperature', 'flow', 'pressure'].map(async (key): Promise<[string, string]> => [
        key,
        (await page.getByTestId(`phase-${phase}-${key}`).textContent())!.trim(),
      ]),
    ),
  );

test('idle before a shot, a running shot, and the finished shot that stays: one graph, one column of a fixed width', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await home(page);

  // Idle, no shot yet: the empty graph, the column with the target yield and '–', no stop.
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'none');
  await expect(page.getByTestId('shot-timer')).toHaveText('–s');
  await expect(page.getByTestId('shot-weight')).toHaveText('–g');
  await expect(page.getByTestId('shot-column')).toContainText('stops at 36 g');
  await expect(page.getByTestId('stop')).toHaveCount(0);
  await expect(page.getByTestId('shot-phases')).toHaveCount(0);
  const column = await box(page, 'shot-column');
  const graph = await box(page, 'empty-graph');
  // 17 rem: a rem is 16 px at 1280 x 800.
  expect(column.width).toBeCloseTo(17 * 16, 0);
  expect(graph.x + graph.width).toBeLessThan(column.x);
  await page.screenshot({ path: 'docs/product/home-idle.png' });

  // The shot runs: live curves, the step in the state line, live values and stop at the bottom.
  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('shot-plot')).toBeVisible();
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  await expect(page.getByTestId('status')).toBeVisible();
  await expect(page.getByTestId('stop')).toBeEnabled();
  await expect(page.getByTestId('shot-phases')).toHaveCount(0);
  await expect(page.getByTestId('shot-timer-label')).toHaveText('time');
  expect(await number(page, 'shot-timer')).toBeGreaterThan(5);
  expect(await number(page, 'shot-weight')).toBeGreaterThan(0);
  expect(await number(page, 'shot-pressure')).toBeGreaterThan(0);
  // Nothing changed size: the column and the graph's width are those of idle.
  expect(await box(page, 'shot-column')).toEqual(column);
  const live = await box(page, 'shot-plot');
  expect(live.x).toBe(graph.x);
  expect(live.width).toBe(graph.width);
  const stop = await box(page, 'stop');
  expect(stop.y + stop.height).toBeCloseTo(column.y + column.height, 0);
  const line = await box(page, 'status');
  expect(live.y).toBeGreaterThanOrEqual(line.y + line.height - 1);
  await page.screenshot({ path: 'docs/product/home-shot-running.png' });

  // The machine stops and goes idle: the shot stays, with 'time, finished' and the table.
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(page.getByTestId('shot-timer-label')).toHaveText('time, finished');
  await expect(page.getByTestId('state-step')).toHaveCount(0);
  await expect(page.getByTestId('stop')).toHaveCount(0);
  for (const gone of ['shot-close-hint', 'shot-close', 'dismiss-shot', 'shot-overlay']) {
    await expect(page.getByTestId(gone)).toHaveCount(0);
  }
  expect(await number(page, 'shot-timer')).toBeGreaterThan(25);
  expect(await number(page, 'shot-weight')).toBeGreaterThan(0);
  expect((await box(page, 'last-shot')).width).toBe(graph.width);
  expect(await box(page, 'shot-column')).toEqual(column);
  const rows = page.getByTestId('shot-phases').locator('tbody th');
  await expect(rows).toHaveText(['Preinfusion', 'Extraction', 'Total']);
  // Streamline 0.2.14's own table of the same frames (src/shell/phases.test.ts).
  expect(await cells(page, 'preinfusion')).toEqual({
    seconds: '4',
    weight: '0.0g',
    volume: '34',
    temperature: '78→89',
    flow: '7.4→8.0',
    pressure: '0.7→3.1',
  });
  expect(await cells(page, 'extraction')).toEqual({
    seconds: '23',
    weight: '34.0g',
    volume: '40',
    temperature: '89→93',
    flow: '8.0→2.3',
    pressure: '3.3→10.0→6.6',
  });
  expect(await cells(page, 'total')).toEqual({
    seconds: '27',
    weight: '34.0g',
    volume: '74',
    temperature: '',
    flow: '',
    pressure: '',
  });
  const viewport = page.viewportSize()!;
  const table = await box(page, 'shot-phases');
  expect(table.y + table.height).toBeLessThanOrEqual(viewport.height);
  expect(table.x + table.width).toBeLessThan(column.x);
  // The table's frame has the graph's rounded corners.
  const corners = (testid: string) =>
    page.getByTestId(testid).evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderTopLeftRadius, collapse: style.borderCollapse };
    });
  const frame = await corners('shot-phases');
  expect(frame.collapse).toBe('separate');
  expect(parseFloat(frame.radius)).toBeGreaterThan(0);
  expect(frame.radius).toBe((await corners('last-shot')).radius);
  await page.screenshot({ path: 'docs/product/home-shot-finished.png' });

  // A tap on the graph closes nothing: the shot stays, and the menu opens as before.
  await page.getByTestId('last-shot').click();
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('menu-list')).toBeVisible();
  await page.getByTestId('menu-backdrop').click();
  await expect(page.getByTestId('last-shot')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the next shot replaces the finished one, also from another screen', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('shot-phases')).toBeVisible();

  // A second shot: home runs the new one, without the table.
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('shot-phases')).toHaveCount(0);
  await expect(page.getByTestId('last-shot')).toHaveCount(0);
  await expect(page.getByTestId('stop')).toBeEnabled();
  expect(await number(page, 'shot-timer')).toBeLessThan(10);
  await gateway.replay(page, 0.3, 1);
  await expect(page.getByTestId('shot-phases')).toBeVisible();

  // On the steam page, a third shot: home comes back with it.
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('shot-plot')).toBeVisible();
  await expect(page.getByTestId('last-shot')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a recalled history entry lies over the finished shot with its caption and its dismiss chip', async ({ page }) => {
  const gateway = await mockGateway(page);
  const light = profile('A-Flow / default-light', 48, 9);
  gateway.addShot('shot-1', '2026-10-12T08:00:00.000000', light, {
    coffeeName: 'Red Brick',
    coffeeRoaster: 'Square Mile',
    targetYield: 48,
  });
  await home(page);
  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('last-shot')).toBeVisible();

  await page.getByTestId('history-handle').tap();
  await page.getByTestId('history-entry').first().tap();
  await expect(page.getByTestId('history-graph')).toBeVisible();
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'recalled');
  await expect(page.getByTestId('recalled')).toContainText('last shot with');
  await expect(page.getByTestId('recalled-profile')).toHaveText('A-Flow / default-light');
  await expect(page.getByTestId('dismiss-recalled')).toBeVisible();
  await expect(page.getByTestId('shot-phases')).toHaveCount(0);
  await expect(page.getByTestId('stop')).toHaveCount(0);
  expect(await number(page, 'shot-timer')).toBeGreaterThan(20);

  // Dismissed: the machine's finished shot is back.
  await page.getByTestId('dismiss-recalled').tap();
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await expect(page.getByTestId('shot-phases')).toBeVisible();
  expect(errors).toEqual([]);
});

test('with the setting shot values off, home shows no per-phase table after a shot and the graph takes its room', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  const lever = page.getByTestId('setting-show-shot-values');
  await expect(lever).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'docs/product/settings-shot-values.png' });
  await lever.click();
  await expect(lever).toHaveAttribute('aria-checked', 'false');
  await back(page);
  await expect(page.getByTestId('screen-home')).toBeVisible();

  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('shot-phases')).toHaveCount(0);
  // The values on the right stay.
  for (const id of ['shot-timer', 'shot-weight', 'shot-pressure', 'shot-flow', 'shot-temperature']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  expect(await number(page, 'shot-timer')).toBeGreaterThan(25);
  // The graph reaches down to the column's bottom.
  const column = await box(page, 'shot-column');
  const plot = await box(page, 'last-shot');
  expect(Math.abs(column.y + column.height - (plot.y + plot.height))).toBeLessThan(2);
  await page.screenshot({ path: 'docs/product/home-shot-no-values.png' });
  expect(errors).toEqual([]);
});
