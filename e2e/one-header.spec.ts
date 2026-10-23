import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// One header on home, steam and hot water (spec 3.11, X3; acceptance 69): the state line starts
// it at the same place with the same values; the right end is home's menu or the page's title.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const REM = 16;

/** The header of the page shown: the state line's box and values, and the box at its right end. */
async function measure(page: Page, screen: string, end: string, same?: string[]) {
  const shown = page.getByTestId(`screen-${screen}`);
  const header = shown.locator('header.page-header');
  await expect(header.getByTestId('status')).toBeVisible();
  // The same values as home's, once the page has read them.
  if (same) await expect(header.locator('[data-testid="status"] b')).toHaveText(same);
  const line = (await header.getByTestId('status').boundingBox())!;
  const own = (await header.boundingBox())!;
  const right = (await header.getByTestId(end).boundingBox())!;
  const values = await header.locator('[data-testid="status"] b').allTextContents();
  return { line, own, right, values, header };
}

test('the state line starts the header at the same x on home, steam and hot water; the right end is the menu or the title', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(525);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  const home = await measure(page, 'home', 'menu');
  await expect(home.header.getByTestId('page-title')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/header-home.png' });

  await toPage(page, 'hot-water');
  const water = await measure(page, 'hot-water', 'page-title', home.values);
  await expect(water.header.getByTestId('page-title')).toHaveText('Hot water');
  await expect(water.header.getByTestId('menu')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/header-hot-water.png' });

  await toPage(page, 'home');
  await toPage(page, 'steam');
  const steam = await measure(page, 'steam', 'page-title', home.values);
  await expect(steam.header.getByTestId('page-title')).toHaveText('Steam');
  await expect(steam.header.getByTestId('menu')).toHaveCount(0);

  // While steaming, 'steaming 12 s' is beside the state line, left of the title.
  gateway.steamFor(18);
  await expect(page.getByTestId('steam-state')).toContainText('steaming');
  const run = (await page.getByTestId('steam-state').boundingBox())!;
  const title = (await steam.header.getByTestId('page-title').boundingBox())!;
  const line = (await steam.header.getByTestId('status').boundingBox())!;
  expect(run.x).toBeGreaterThanOrEqual(line.x + line.width - 1);
  expect(run.x + run.width).toBeLessThanOrEqual(title.x + 1);
  expect(line.x).toBeCloseTo(home.line.x, 0);
  await page.screenshot({ path: 'docs/product/header-steam.png' });

  for (const other of [steam, water]) {
    // The state line in the same place on all three pages.
    expect(other.line.x).toBeCloseTo(home.line.x, 0);
    expect(other.line.y).toBeCloseTo(home.line.y, 0);
    // The title at the header's right end, as the menu is on home.
    expect(other.right.x + other.right.width).toBeCloseTo(other.own.x + other.own.width, 0);
    expect(other.right.x).toBeGreaterThan(other.line.x + other.line.width - 1);
  }
  expect(home.right.x + home.right.width).toBeCloseTo(home.own.x + home.own.width, 0);
  // Home has no way back: its line starts where the other pages' do, after their back arrow's column.
  expect(home.line.x).toBeLessThan(6 * REM);
  expect(errors).toEqual([]);
});
