import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The profile and bean buttons sit at the top of home's right column while no shot runs (spec
// 3.11, X2): one under the other, each as wide as the column, the name and the bean cut with an
// ellipsis. During a shot they are not drawn and the 7 rem stop button has their room. Home's
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
const BUTTONS = ['open-profiles', 'profile-name', 'open-editor', 'open-pick', 'next-bean', 'next-setting'];

test('the profile and bean buttons are in the column while idle, gone during a shot and back after it', async ({ page }) => {
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
  expect((await box(page, 'open-profiles')).height).toBeCloseTo(3.5 * REM, 0);
  expect(pick.height).toBeCloseTo(3.5 * REM, 0);
  // Below them the two big numbers and the three small rows, all inside the column.
  const timer = await box(page, 'shot-timer');
  expect(timer.y).toBeGreaterThan(pick.y + pick.height);
  const temperature = await box(page, 'shot-temperature');
  expect(temperature.y + temperature.height).toBeLessThanOrEqual(area.y + area.height);
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-medium');

  // The shot runs: no buttons, the stop button keeps its 7 rem at the column's bottom.
  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  for (const id of BUTTONS) await expect(page.getByTestId(id)).toHaveCount(0);
  const stop = await box(page, 'stop');
  expect(stop.height).toBeCloseTo(7 * REM, 0);
  expect(stop.y + stop.height).toBeCloseTo(area.y + area.height, 0);
  expect(stop.y).toBeGreaterThan((await box(page, 'shot-temperature')).y);

  // After it: the buttons are back, the stop button's place is empty.
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('stop')).toHaveCount(0);
  for (const id of BUTTONS) await expect(column.getByTestId(id)).toBeVisible();
  expect(await box(page, 'open-pick')).toEqual(pick);

  // The buttons still open the picker and the bean pick.
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a long profile name and a long bean are cut with an ellipsis; the column keeps its width', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = {
    ...gateway.workflow.profile,
    title: 'A very long profile name that never fits into the column of home',
  };
  gateway.workflow.context = {
    ...gateway.workflow.context,
    coffeeRoaster: 'The roastery with the longest name in town',
    coffeeName: 'Ethiopia Yirgacheffe Washed Heirloom',
    grinderSetting: '12.5',
  };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  const area = await box(page, 'shot-column');
  expect(area.width).toBeCloseTo(17 * REM, 0);

  for (const id of ['profile-name', 'next-bean']) {
    const text = page.getByTestId(id);
    await expect(text).not.toHaveText('–');
    const cut = await text.evaluate((element) => ({
      overflow: getComputedStyle(element).textOverflow,
      wrap: getComputedStyle(element).whiteSpace,
      cut: element.scrollWidth > element.clientWidth,
    }));
    expect(cut).toEqual({ overflow: 'ellipsis', wrap: 'nowrap', cut: true });
    const shown = await box(page, id);
    expect(shown.x + shown.width).toBeLessThanOrEqual(area.x + area.width);
  }
  // The pen and the grinder setting stay whole, inside the column.
  for (const id of ['open-editor', 'next-setting']) {
    const shown = await box(page, id);
    expect(shown.x + shown.width).toBeLessThanOrEqual(area.x + area.width + 1);
  }
  await expect(page.getByTestId('next-setting')).toHaveText('12.5');
  expect((await box(page, 'open-pick')).height).toBeCloseTo(3.5 * REM, 0);
  await page.screenshot({ path: 'docs/product/home-column-long-names.png' });
  expect(errors).toEqual([]);
});
