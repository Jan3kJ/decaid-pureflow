import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import type { Profile } from '../src/api';
import { toPage } from './touch';

// Steam's header and the captions: the state line and 'last steam' never overlap (with the heater off
// the last steam is not shown at all), and every caption of the skin is lower case.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const intersect = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The computed text-transform of every `.caption` on the visible page. */
const transforms = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.page:not([inert]) .caption')].map((node) => getComputedStyle(node).textTransform),
  );

test('with the heater off and no scale the header shows no last steam and its boxes do not overlap', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.steamFor(4);
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Steam');
  gateway.state = 'idle';
  await expect(page.getByTestId('steam-state')).toContainText('last steam');

  gateway.setMachineSteamTarget(0);
  gateway.connectScale(false);
  await expect(page.getByTestId('steam-heater-on')).toBeVisible();
  await expect(page.getByTestId('steam-state')).toHaveCount(0);
  await expect(page.getByText('last steam')).toHaveCount(0);
  const status = await page.getByTestId('status').boundingBox();
  const button = await page.getByTestId('steam-heater-on').boundingBox();
  expect(intersect(status!, button!)).toBe(false);
  await page.screenshot({ path: 'test-results/steam-header-off.png' });
  expect(errors).toEqual([]);
});

test('with the heater on and a finished steam the state line and the last steam do not overlap', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.steamFor(4);
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Steam');
  gateway.state = 'idle';
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  const status = await page.getByTestId('status').boundingBox();
  const last = await page.getByTestId('steam-state').boundingBox();
  expect(intersect(status!, last!)).toBe(false);
  await page.screenshot({ path: 'test-results/steam-column.png' });
  expect(errors).toEqual([]);
});

test('every caption is lower case on home and steam', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('shot-timer-label')).toBeVisible();
  const home = await transforms(page);
  expect(home.length).toBeGreaterThan(0);
  expect(new Set(home)).toEqual(new Set(['none']));
  await toPage(page, 'steam');
  await expect(page.getByText('steam timer')).toHaveCSS('text-transform', 'none');
  expect(new Set(await transforms(page))).toEqual(new Set(['none']));
});

test('every caption is lower case in the A-Flow editor and the profile list', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await page.getByTestId('editor-profile').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await page.getByTestId('profile-item').first().click();
  const list = await transforms(page);
  expect(list.length).toBeGreaterThan(0);
  expect(new Set(list)).toEqual(new Set(['none']));
});

test('every caption is lower case in the step editor', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile);
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('step-cards')).toBeVisible();
  const found = await transforms(page);
  expect(found.length).toBeGreaterThan(0);
  expect(new Set(found)).toEqual(new Set(['none']));
});
