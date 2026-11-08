import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The profile and bean buttons sit at the top of home's right column while no shot runs:
// one under the other, each as wide as the column, the name first and its family or
// roaster in a caption under it, each line cut with an ellipsis. During a shot they stay at their place but off, so the time,
// the weight and the stop do not move; the 7 rem stop button is at the column's bottom. Home's
// header holds the state line and the menu only.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const box = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!;
const REM = 16;
const BUTTONS = ['open-profiles', 'profile-name', 'profile-caption', 'open-editor', 'open-pick', 'next-bean', 'next-setting'];
/** the height of each button, room for the name and its caption */
const HEIGHT = 4.7 * REM;
const TAPPABLE = ['open-profiles', 'open-editor', 'open-pick'];
const top = async (page: Page, testid: string) => (await box(page, testid)).y;

test('the profile and bean buttons are in the column while idle, off during a shot and live after it', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.context = { ...gateway.workflow.context, grinderSetting: '5.2' };
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');

  // The header: the state line and the menu, nothing else.
  const header = page.getByTestId('screen-home').locator('header.page-header');
  await expect(header.getByTestId('status')).toBeVisible();
  await expect(header.getByTestId('menu')).toBeVisible();
  for (const id of BUTTONS) await expect(header.getByTestId(id)).toHaveCount(0);
  // The menu is the header's right end, over the column; the readings are left of it.
  const line = await box(page, 'status');
  const menu = await box(page, 'menu');
  const own = (await header.boundingBox())!;
  const side = await box(page, 'shot-column');
  expect(menu.x + menu.width).toBeCloseTo(own.x + own.width, 0);
  expect(menu.x).toBeGreaterThanOrEqual(side.x);
  expect(line.x + line.width).toBeLessThanOrEqual(side.x);

  // Idle: both buttons at the column's top, one under the other, each as wide as the column.
  const column = page.getByTestId('shot-column');
  for (const id of BUTTONS) await expect(column.getByTestId(id)).toBeVisible();
  const area = await box(page, 'shot-column');
  const profile = (await column.locator('.profile').boundingBox())!;
  const pick = await box(page, 'open-pick');
  expect(profile.y).toBeCloseTo(area.y, 0);
  expect(profile.width).toBeCloseTo(area.width, 0);
  expect(pick.width).toBeCloseTo(area.width, 0);
  expect(pick.y).toBeGreaterThanOrEqual(profile.y + profile.height);
  expect((await box(page, 'open-profiles')).height).toBeCloseTo(HEIGHT, 0);
  expect(pick.height).toBeCloseTo(HEIGHT, 0);
  // Below them the two big numbers and the three small rows, all inside the column.
  const timer = await box(page, 'shot-timer');
  expect(timer.y).toBeGreaterThan(pick.y + pick.height);
  const temperature = await box(page, 'shot-temperature');
  expect(temperature.y + temperature.height).toBeLessThanOrEqual(area.y + area.height);
  await expect(page.getByTestId('profile-name')).toHaveText('default-medium');
  await expect(page.getByTestId('profile-caption')).toHaveText('A-Flow');
  // No bean: the one line, no caption, at the same height.
  await expect(page.getByTestId('next-bean')).toHaveText('no bean');
  await expect(page.getByTestId('next-bean-caption')).toHaveCount(0);
  for (const id of TAPPABLE) await expect(page.getByTestId(id)).toBeEnabled();
  const timerTop = timer.y;
  const weightTop = await top(page, 'shot-weight');

  // The shot runs: the buttons stay at their place, shown but off; the time and the weight keep
  // theirs, and the stop button keeps its 7 rem at the column's bottom, under the values.
  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Pouring');
  for (const id of BUTTONS) await expect(column.getByTestId(id)).toBeVisible();
  for (const id of TAPPABLE) await expect(page.getByTestId(id)).toBeDisabled();
  expect(await box(page, 'open-pick')).toEqual(pick);
  expect(await top(page, 'shot-timer')).toBeCloseTo(timerTop, 0);
  expect(await top(page, 'shot-weight')).toBeCloseTo(weightTop, 0);
  const stop = await box(page, 'stop');
  expect(stop.height).toBeCloseTo(7 * REM, 0);
  expect(stop.y + stop.height).toBeCloseTo(area.y + area.height, 0);
  const temperatureNow = await box(page, 'shot-temperature');
  expect(stop.y).toBeGreaterThanOrEqual(temperatureNow.y + temperatureNow.height);
  // A tap on an off button opens nothing.
  await page.getByTestId('open-pick').click({ force: true });
  await expect(page.getByTestId('pick')).toHaveCount(0);

  // After it: the buttons are live again at the same place, the stop button's place is empty.
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await expect(page.getByTestId('stop')).toHaveCount(0);
  for (const id of BUTTONS) await expect(column.getByTestId(id)).toBeVisible();
  for (const id of TAPPABLE) await expect(page.getByTestId(id)).toBeEnabled();
  expect(await box(page, 'open-pick')).toEqual(pick);
  expect(await top(page, 'shot-timer')).toBeCloseTo(timerTop, 0);
  expect(await top(page, 'shot-weight')).toBeCloseTo(weightTop, 0);

  // The buttons still open the picker and the bean pick.
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick')).toBeVisible();
  expect(errors).toEqual([]);
});

/** Long names: the part that tells two buttons apart comes after the long part. */
async function longNames(page: Page) {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = {
    ...gateway.workflow.profile,
    title: 'A-Flow 3.0 by a very long family name / a very long profile name that never fits into the column',
  };
  gateway.workflow.context = {
    ...gateway.workflow.context,
    coffeeRoaster: 'Very Long Roastery Name with the longest name in town',
    coffeeName: 'Ethiopia Yirgacheffe Washed Heirloom Grade 1',
    grinderSetting: '12.5',
  };
  return gateway;
}

test('long names show the name first; each line is cut with an ellipsis and the column keeps its width', async ({ page }) => {
  await longNames(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  const area = await box(page, 'shot-column');
  expect(area.width).toBeCloseTo(17 * REM, 0);
  await expect(page.getByTestId('profile-name')).toHaveText('a very long profile name that never fits into the column');
  await expect(page.getByTestId('profile-caption')).toHaveText('A-Flow 3.0 by a very long family name');
  await expect(page.getByTestId('next-bean')).toHaveText('Ethiopia Yirgacheffe Washed Heirloom Grade 1');
  await expect(page.getByTestId('next-bean-caption')).toHaveText('Very Long Roastery Name with the longest name in town');

  for (const id of ['profile-name', 'profile-caption', 'next-bean', 'next-bean-caption']) {
    const cut = await page.getByTestId(id).evaluate((element) => ({
      overflow: getComputedStyle(element).textOverflow,
      wrap: getComputedStyle(element).whiteSpace,
      cut: element.scrollWidth > element.clientWidth,
    }));
    expect(cut).toEqual({ overflow: 'ellipsis', wrap: 'nowrap', cut: true });
    const shown = await box(page, id);
    expect(shown.x + shown.width).toBeLessThanOrEqual(area.x + area.width);
  }
  // The name above its caption, both inside the button.
  const name = await box(page, 'next-bean');
  const caption = await box(page, 'next-bean-caption');
  const pick = await box(page, 'open-pick');
  expect(caption.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  expect(caption.y + caption.height).toBeLessThanOrEqual(pick.y + pick.height);
  // The pen and the grinder setting stay whole, inside the column.
  for (const id of ['open-editor', 'next-setting']) {
    const shown = await box(page, id);
    expect(shown.x + shown.width).toBeLessThanOrEqual(area.x + area.width + 1);
  }
  await expect(page.getByTestId('next-setting')).toHaveText('12.5');
  expect(pick.height).toBeCloseTo(HEIGHT, 0);
  await page.screenshot({ path: 'docs/product/home-column-long-names.png' });
  expect(errors).toEqual([]);
});

test('a title without a family is the name alone, and the button keeps its height', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = { ...gateway.workflow.profile, title: 'Best practice' };
  gateway.workflow.context = { ...gateway.workflow.context, coffeeRoaster: 'Square Mile' };
  await page.goto('/');
  await expect(page.getByTestId('profile-name')).toHaveText('Best practice');
  await expect(page.getByTestId('profile-caption')).toHaveCount(0);
  // A bean with a roaster and no name: the roaster is the one line.
  await expect(page.getByTestId('next-bean')).toHaveText('Square Mile');
  await expect(page.getByTestId('next-bean-caption')).toHaveCount(0);
  expect((await box(page, 'open-profiles')).height).toBeCloseTo(HEIGHT, 0);
  expect((await box(page, 'open-pick')).height).toBeCloseTo(HEIGHT, 0);
  expect(errors).toEqual([]);
});

for (const [size, factor] of [
  ['medium', 1],
  ['extra large', 1.3],
] as const) {
  test(`at the display size ${size} the column holds the long names, the values and the stop during a shot`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('pureflow.settings', JSON.stringify({ displaySize: value })), factor);
    const gateway = await longNames(page);
    await page.goto('/');
    await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
    const root = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--display-size').trim());
    expect(await root()).toBe(`${factor}`);

    await gateway.replay(page, 0, 0.6);
    await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
    await expect(page.getByTestId('stop')).toBeVisible();
    await page.screenshot({ path: `docs/product/home-column-size-${factor}.png` });
    // Nothing in the column is wider than its box but the names and captions, which are cut on purpose.
    const column = page.getByTestId('shot-column');
    const wide = await column.evaluate((element: HTMLElement): string[] =>
      [element, ...element.querySelectorAll<HTMLElement>('*')]
        .filter((each) => !each.matches('button strong, button small'))
        .filter((each) => each.clientWidth > 0 && each.scrollWidth > each.clientWidth)
        .map((each) => each.getAttribute('data-testid') ?? String(each.className)),
    );
    expect(wide).toEqual([]);
    const high = await column.evaluate((element) => element.scrollHeight - element.clientHeight);
    expect(high).toBeLessThanOrEqual(0);
    // The stop button whole inside the viewport and the column, under the values.
    const viewport = page.viewportSize()!;
    const area = await box(page, 'shot-column');
    const stop = await box(page, 'stop');
    expect(stop.x).toBeGreaterThanOrEqual(0);
    expect(stop.y).toBeGreaterThanOrEqual(0);
    expect(stop.x + stop.width).toBeLessThanOrEqual(viewport.width);
    expect(stop.y + stop.height).toBeLessThanOrEqual(viewport.height);
    expect(stop.y + stop.height).toBeLessThanOrEqual(area.y + area.height + 1);
    const temperature = await box(page, 'shot-temperature');
    expect(stop.y).toBeGreaterThanOrEqual(temperature.y + temperature.height);
    const pick = await box(page, 'open-pick');
    expect(await top(page, 'shot-timer')).toBeGreaterThanOrEqual(pick.y + pick.height);
    expect(errors).toEqual([]);
  });
}

const VALUES = ['shot-timer', 'shot-weight', 'shot-pressure', 'shot-flow', 'shot-temperature'];
const CAPTIONS = ['shot-timer-label', 'shot-weight-label', 'shot-pressure', 'shot-flow', 'shot-temperature'];

/** each value's number, unit and caption box, and the value's top */
const rows = (page: Page) =>
  Promise.all(
    VALUES.map(async (id, at) => {
      const value = page.getByTestId(id);
      const caption = CAPTIONS[at].endsWith('label') ? page.getByTestId(CAPTIONS[at]) : value.locator('xpath=preceding-sibling::dt');
      return {
        value: (await value.boundingBox())!,
        unit: (await value.locator('i').boundingBox())!,
        caption: (await caption.boundingBox())!,
      };
    }),
  );

test("the numbers are aligned as on the steam page: caption left, number and unit right, 'stops at' on a second line", async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  const area = await box(page, 'shot-column');
  const shown = await rows(page);
  for (const { value, unit, caption } of shown) {
    // The caption at the column's left, the value at its right, the unit at the value's end.
    expect(caption.x).toBeCloseTo(area.x, 0);
    expect(value.x + value.width).toBeCloseTo(area.x + area.width, 0);
    expect(unit.x + unit.width).toBeCloseTo(value.x + value.width, 0);
    expect(caption.x + caption.width).toBeLessThanOrEqual(value.x);
    // Not centred like the steam timer: the caption beside the number, not over it.
    expect(caption.y + caption.height).toBeGreaterThan(value.y);
  }
  // One unit column: every unit starts on one edge, so every number ends on one edge.
  for (const { unit } of shown) expect(unit.x).toBeCloseTo(shown[0].unit.x, 0);

  // A long caption takes two lines, 'weight' over 'stops at 36 g', beside its number.
  const label = page.getByTestId('shot-weight-label');
  await expect(label.locator('span')).toHaveText(['weight', 'stops at 36 g']);
  const [first, second] = await Promise.all([0, 1].map(async (at) => (await label.locator('span').nth(at).boundingBox())!));
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1);
  expect(second.x).toBeCloseTo(first.x, 0);
  const weight = shown[1].value;
  expect(first.y).toBeGreaterThanOrEqual(weight.y);
  expect(second.y + second.height).toBeLessThanOrEqual(weight.y + weight.height);
  await page.screenshot({ path: 'docs/product/home-shot-numbers.png' });
  expect(errors).toEqual([]);
});

test('no number moves when the caption has one line or two', async ({ page }) => {
  const tops = async (target: number) => {
    const gateway = await mockGateway(page);
    gateway.workflow.context = { ...gateway.workflow.context, targetYield: target };
    await page.goto('/');
    await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
    await expect(page.getByTestId('shot-stops-at')).toHaveCount(target ? 1 : 0);
    return (await rows(page)).map(({ value }) => value);
  };
  const two = await tops(36);
  const one = await tops(0);
  expect(one).toEqual(two);
  expect(errors).toEqual([]);
});

test('the caption is centred on the middle of its row, running and finished, and no row moves', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  const measure = async () =>
    Promise.all(
      VALUES.map(async (id, at) => {
        const value = page.getByTestId(id);
        const caption = CAPTIONS[at].endsWith('label') ? page.getByTestId(CAPTIONS[at]) : value.locator('xpath=preceding-sibling::dt');
        const row = (await value.locator('xpath=..').boundingBox())!;
        const text = (await caption.boundingBox())!;
        return { row, middle: text.y + text.height / 2 - (row.y + row.height / 2) };
      }),
    );
  const check = async (kind: string) => {
    await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', kind);
    const shown = await measure();
    for (const { middle } of shown) expect(Math.abs(middle)).toBeLessThanOrEqual(1);
    return shown.map(({ row }) => row);
  };
  await gateway.replay(page, 0, 0.6);
  const running = await check('running');
  await page.screenshot({ path: 'test-results/captions-running.png' });
  await gateway.replay(page, 0.6, 1);
  const finished = await check('finished');
  await page.screenshot({ path: 'test-results/captions-finished.png' });
  expect(finished).toEqual(running);
  expect(errors).toEqual([]);
});
