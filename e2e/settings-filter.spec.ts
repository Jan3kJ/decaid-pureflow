import { expect, test, type Page } from '@playwright/test';
import type { Settings } from '../src/settings';
import { mockGateway, type MockGateway } from './mock-gateway';
import { back } from './touch';

// The settings page's filter against the mocked gateway: a word finds the rows of every category,
// each working and under its category and subcategory name; two words need both; a word of no
// row says so; an empty filter gives the page back.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pureflow.settings') ?? '{}') as Settings);

test('a word lists its rows of every category, each working and under its names', async ({ page }) => {
  await openSettings(page);
  const filter = page.getByTestId('settings-filter');
  await expect(filter).toHaveAttribute('type', 'search');
  await expect(page.getByTestId('settings-where-steam')).toHaveCount(0);

  // 'steam' lives under Quick Adjustments and under Skin.
  await filter.fill('STEAM');
  await expect(page.getByTestId('settings-where-steam')).toHaveText('Quick Adjustments > Steam');
  await expect(page.getByTestId('settings-where-skin-steam')).toHaveText('Skin > Steam');
  await page.screenshot({ path: 'e2e/.results/settings-filter-steam.png' });

  // A machine's row works: the number pad writes that key, and the page shows what it reads back.
  await filter.fill('flush flow');
  await expect(page.getByTestId('settings-where-flush')).toHaveText('Quick Adjustments > Flush');
  const writesBefore = gateway.calls('POST', '/api/v1/workflow').length + gateway.calls('PUT', '/api/v1/workflow').length;
  await page.getByTestId('setting-flush-flow').click();
  await page.getByTestId('numpad-key-5').click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
  await expect(page.getByTestId('setting-flush-flow').locator('b')).toContainText('5');
  expect(gateway.calls('POST', '/api/v1/workflow').length + gateway.calls('PUT', '/api/v1/workflow').length).toBeGreaterThan(
    writesBefore,
  );

  // The skin's own row works too.
  await filter.fill('legend');
  await expect(page.getByTestId('settings-where-skin-graph')).toHaveText('Skin > Shot graph');
  const before = await page.getByTestId('setting-show-graph-legend').isChecked();
  await page.getByTestId('setting-show-graph-legend').click();
  await expect.poll(async () => (await stored(page)).showGraphLegend).toBe(!before);
  await expect(page.getByTestId('setting-show-shot-values')).toHaveCount(0);
});

test('two words need both, in any order, and a word of no row says so', async ({ page }) => {
  await openSettings(page);
  const filter = page.getByTestId('settings-filter');

  await filter.fill('skin mugs');
  await expect(page.getByTestId('setting-mug-small')).toBeVisible();
  await expect(page.getByTestId('settings-where-steam')).toHaveCount(0);
  await expect(page.getByTestId('setting-reference-seconds')).toHaveCount(0);
  await filter.fill('mugs skin');
  await expect(page.getByTestId('setting-mug-small')).toBeVisible();

  await filter.fill('mugs fan');
  await expect(page.getByTestId('settings-no-match')).toHaveText('no setting matches');
  await filter.fill('xylophone');
  await expect(page.getByTestId('settings-no-match')).toHaveText('no setting matches');
  await page.screenshot({ path: 'e2e/.results/settings-filter-none.png' });
  await expect(page.getByTestId('settings-content').locator('section')).toHaveCount(0);
});

test('an empty filter gives the page back, and the filter is not kept when the page is left', async ({ page }) => {
  await openSettings(page);
  const filter = page.getByTestId('settings-filter');
  const content = page.getByTestId('settings-content');
  await page.getByTestId('settings-category-calibration').click();
  const whole = await content.locator('section').count();

  await filter.fill('steam');
  await expect(page.getByTestId('settings-where-skin-steam')).toBeVisible();
  await filter.fill('   ');
  await expect(page.getByTestId('settings-where-skin-steam')).toHaveCount(0);
  await expect(content).toHaveAttribute('data-category', 'calibration');
  await expect(content.locator('section')).toHaveCount(whole);

  await filter.fill('steam');
  await expect(page.getByTestId('settings-where-skin-steam')).toBeVisible();
  await back(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(filter).toHaveValue('');
  await expect(content).toHaveAttribute('data-category', 'calibration');
});

test("a tap on a hit's name goes there, and a tap on a category leaves the filter", async ({ page }) => {
  await openSettings(page);
  const filter = page.getByTestId('settings-filter');
  const content = page.getByTestId('settings-content');

  await filter.fill('mugs');
  await page.getByTestId('settings-where-skin-steam').click();
  await expect(filter).toHaveValue('');
  await expect(content).toHaveAttribute('data-category', 'skin');
  await expect(page.getByTestId('settings-steam')).toBeInViewport();
  await expect(page.getByTestId('setting-reference-seconds')).toBeVisible();

  await filter.fill('multiplier');
  await page.getByTestId('settings-where-flowmultiplier').click();
  await expect(content).toHaveAttribute('data-category', 'quickadjustments');

  await filter.fill('fan');
  await page.getByTestId('settings-category-machine').click();
  await expect(filter).toHaveValue('');
  await expect(content).toHaveAttribute('data-category', 'machine');
});

test("a view shows whole by its subcategory's name, and a part of a view stays out of a row's hit", async ({ page }) => {
  await openSettings(page);
  const filter = page.getByTestId('settings-filter');

  await filter.fill('plugins');
  await expect(page.getByTestId('settings-where-extention2')).toHaveText('Extensions > Plugins');
  await expect(
    page
      .getByTestId('settings-section-extention2')
      .getByTestId(/^plugin-/)
      .first(),
  ).toBeVisible();

  await filter.fill('connections scale');
  await expect(page.getByTestId('devices-scale')).toBeVisible();
  await expect(page.getByTestId('devices-machine')).toHaveCount(0);

  // The water tank's level alert is a row beside the tank unit's view: the view stays out.
  await filter.fill('level alert');
  await expect(page.getByTestId('settings-where-watertank')).toBeVisible();
  await expect(page.getByTestId('row-water-alert')).toBeVisible();
  await expect(page.getByTestId('settings-section-watertank').getByTestId('setting-tank-unit')).toHaveCount(0);
});

test("the Bengle's rows stay hidden on another machine", async ({ page }) => {
  await openSettings(page);
  const filter = page.getByTestId('settings-filter');
  await filter.fill('cup warmer');
  await expect(page.getByTestId('settings-no-match')).toBeVisible();
  await filter.fill('load cells');
  await expect(page.getByTestId('settings-no-match')).toBeVisible();
});

test('a long hit list fits the width and scrolls in the panel only', async ({ page }) => {
  await openSettings(page);
  await page.getByTestId('settings-filter').fill('a');
  await expect(page.getByTestId('settings-where-skin-steam')).toBeVisible();
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    const wide = [...document.querySelectorAll('button, section, header, nav, input')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 0.5);
    });
    return { scrollsX: root.scrollWidth > innerWidth, scrollsY: root.scrollHeight > innerHeight, wide: wide.length };
  });
  expect(fits).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
});
