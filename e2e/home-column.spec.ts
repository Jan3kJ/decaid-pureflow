import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The profile and bean buttons sit at the top of home's right column while no shot runs (spec
// 3.11, X2): one under the other, each as wide as the column, the name first and its family or
// roaster in a caption under it, each line cut with an ellipsis (spec 3.18 item 5). During a shot they stay at their place but off (spec 3.17 item 10), so the time,
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
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // The header: the state line and the menu, nothing else.
  const header = page.getByTestId('screen-home').locator('header.page-header');
  await expect(header.getByTestId('status')).toBeVisible();
  await expect(header.getByTestId('menu')).toBeVisible();
  for (const id of BUTTONS) await expect(header.getByTestId(id)).toHaveCount(0);
  // The state line takes the header's width but the menu's, and the header ends left of the column.
  const line = await box(page, 'status');
  const menu = await box(page, 'menu');
  const own = (await header.boundingBox())!;
  expect(line.x - (menu.x + menu.width)).toBeLessThan(1.5 * REM);
  expect(line.x + line.width).toBeCloseTo(own.x + own.width, 0);
  expect(own.x + own.width).toBeLessThanOrEqual((await box(page, 'shot-column')).x);

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
  await expect(page.getByTestId('status-title')).toHaveText('Pouring');
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
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
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

/** The review's long names: the part that tells two buttons apart comes after the long part. */
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
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
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
    await expect(page.getByTestId('status-title')).toHaveText('Idle');
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
