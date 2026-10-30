import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// One header on home, steam and hot water: the menu
// in the top left corner, the state line right of it at the same place with the same values, the
// page's title at the right end; on home the right column beside it.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const REM = 16;

/** The header of the page shown: the state line's box and values, the corner's menu button, and the title. */
async function measure(page: Page, screen: string, same?: string[]) {
  const shown = page.getByTestId(`screen-${screen}`);
  const header = shown.locator('header.page-header');
  await expect(header.getByTestId('status')).toBeVisible();
  // The same values as home's, once the page has read them.
  if (same) await expect(header.locator('[data-testid="status"] b')).toHaveText(same);
  const line = (await header.getByTestId('status').boundingBox())!;
  const own = (await header.boundingBox())!;
  const menu = (await header.getByTestId('menu').boundingBox())!;
  const values = await header.locator('[data-testid="status"] b').allTextContents();
  const title = (await header.getByTestId('page-title').count()) ? await header.getByTestId('page-title').boundingBox() : null;
  // The same menu on every page.
  await header.getByTestId('menu').click();
  const entries = await page
    .getByTestId('menu-list')
    .getByRole('menuitem')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-testid')));
  await page.getByTestId('menu-backdrop').click({ position: { x: 1200, y: 700 } });
  await expect(page.getByTestId('menu-list')).toHaveCount(0);
  return { line, own, menu, values, entries, title, header };
}

test('the menu is in the top left corner of home, steam and hot water, the state line right of it at the same x; no back arrow', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(525);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  const home = await measure(page, 'home');
  await expect(home.header.getByTestId('page-title')).toHaveCount(0);
  expect(home.entries).toContain('open-settings');
  // The right column starts at the page's top beside the header, which ends left of it.
  const column = (await page.getByTestId('shot-column').boundingBox())!;
  expect(Math.abs(column.y - home.own.y)).toBeLessThan(2);
  expect(home.own.x + home.own.width).toBeLessThanOrEqual(column.x);
  await page.screenshot({ path: 'docs/product/header-home.png' });

  await toPage(page, 'hot-water');
  const water = await measure(page, 'hot-water', home.values);
  await expect(water.header.getByTestId('page-title')).toHaveText('Hot water');
  await page.screenshot({ path: 'docs/product/header-hot-water.png' });

  await toPage(page, 'home');
  await toPage(page, 'steam');
  const steam = await measure(page, 'steam', home.values);
  await expect(steam.header.getByTestId('page-title')).toHaveText('Steam');

  // After a steam, 'last steam 18 s' is beside the state line, left of the title (while it runs
  // the page's 'steam left' is the one clock).
  gateway.steamFor(18);
  await expect(page.getByTestId('steam-stop')).toBeVisible();
  gateway.state = 'idle';
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  const run = (await page.getByTestId('steam-state').boundingBox())!;
  const title = (await steam.header.getByTestId('page-title').boundingBox())!;
  const line = (await steam.header.getByTestId('status').boundingBox())!;
  expect(run.x).toBeGreaterThanOrEqual(line.x + line.width - 1);
  expect(run.x + run.width).toBeLessThanOrEqual(title.x + 1);
  expect(line.x).toBeCloseTo(home.line.x, 0);
  await page.screenshot({ path: 'docs/product/header-steam.png' });

  for (const shown of [home, steam, water]) {
    // The corner button: 56 CSS pixels square, in the top left corner, the state line right of it.
    expect(shown.menu.width).toBeCloseTo(56, 0);
    expect(shown.menu.height).toBeCloseTo(56, 0);
    expect(shown.menu.x).toBeLessThan(2 * REM);
    expect(shown.menu.y).toBeLessThan(2 * REM);
    expect(shown.line.x).toBeGreaterThanOrEqual(shown.menu.x + shown.menu.width);
    expect(shown.entries).toEqual(home.entries);
  }
  for (const other of [steam, water]) {
    // The button and the state line in the same place on all three pages.
    expect(other.menu.x).toBeCloseTo(home.menu.x, 0);
    expect(other.menu.y).toBeCloseTo(home.menu.y, 0);
    expect(other.line.x).toBeCloseTo(home.line.x, 0);
    expect(other.line.y).toBeCloseTo(home.line.y, 0);
    // The title at the header's right end.
    const end = other.title!;
    expect(end.x + end.width).toBeCloseTo(other.own.x + other.own.width, 0);
  }
  await expect(page.getByTestId('nav-home')).toHaveCount(0);
  expect(errors).toEqual([]);
});
