import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// One header on home, steam and hot water: the menu is a bare icon in the top right corner, the page's
// title just left of it (home's too), the readings centred over the page's main frame, no state word.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const REM = 16;

/** The header of the page shown: the readings' extent, the menu button, the title and the main frame. */
async function measure(page: Page, screen: string, same?: string[]) {
  const shown = page.getByTestId(`screen-${screen}`);
  const header = shown.locator('header.page-header');
  await expect(header.getByTestId('status')).toBeVisible();
  // The same values as home's, once the page has read them.
  if (same) await expect(header.locator('[data-testid="status"] b')).toHaveText(same);
  const own = (await header.boundingBox())!;
  const menu = (await header.getByTestId('menu').boundingBox())!;
  const values = await header.locator('[data-testid="status"] b').allTextContents();
  // the readings' own extent: from the first reading's left edge to the last one's right edge
  const readings = await header.getByTestId('status').evaluate((node) => {
    const boxes = [...node.children].map((child) => child.getBoundingClientRect());
    const left = Math.min(...boxes.map((box) => box.left));
    const right = Math.max(...boxes.map((box) => box.right));
    return { x: left, width: right - left };
  });
  const frame = (await shown.locator('[data-main-frame]').boundingBox())!;
  // the menu is a bare icon: no border, no background
  const bare = await header.getByTestId('menu').evaluate((node) => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, background: style.backgroundColor };
  });
  const titleId = screen === 'home' ? 'home-title' : 'page-title';
  const title = (await header.getByTestId(titleId).boundingBox())!;
  // The same menu on every page.
  await header.getByTestId('menu').click();
  const entries = await page
    .getByTestId('menu-list')
    .getByRole('menuitem')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-testid')));
  await page.getByTestId('menu-backdrop').click({ position: { x: 600, y: 700 } });
  await expect(page.getByTestId('menu-list')).toHaveCount(0);
  return { bare, readings, own, menu, values, entries, title, header, frame };
}

test('the menu is the top right corner of home, steam and hot water, the title left of it, the readings centred over the main frame', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(525);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  // The scale's weight arrives on its own stream, after the state: home's readings are taken once it is in,
  // or hot water's (which has it) would never match them.
  await expect(page.getByTestId('state-scale')).toHaveText('525.0 g');

  const home = await measure(page, 'home');
  await expect(home.header.getByTestId('home-title')).toHaveText('Home');
  expect(home.entries).toContain('open-settings');
  // The right column starts level with the graph, under the header's row.
  const column = (await page.getByTestId('shot-column').boundingBox())!;
  expect(column.y).toBeGreaterThan(home.own.y + home.own.height - 1);
  await page.screenshot({ path: 'docs/product/header-home.png' });

  await toPage(page, 'hot-water');
  const water = await measure(page, 'hot-water', home.values);
  await expect(water.header.getByTestId('page-title')).toHaveText('Hot water');
  await page.screenshot({ path: 'docs/product/header-hot-water.png' });

  await toPage(page, 'home');
  await toPage(page, 'steam');
  const steam = await measure(page, 'steam', home.values);
  await expect(steam.header.getByTestId('page-title')).toHaveText('Steam');

  // After a steam, 'last steam 18 s' is beside the title, left of it (while it runs
  // the page's 'steam left' is the one clock).
  gateway.steamFor(18);
  await expect(page.getByTestId('steam-stop')).toBeVisible();
  gateway.state = 'idle';
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  const run = (await page.getByTestId('steam-state').boundingBox())!;
  const title = (await steam.header.getByTestId('page-title').boundingBox())!;
  expect(run.x + run.width).toBeLessThanOrEqual(title.x + 1);
  await page.screenshot({ path: 'docs/product/header-steam.png' });

  for (const shown of [home, steam, water]) {
    // The corner button: 56 CSS pixels square, rightmost in the header, in the top right corner.
    expect(shown.menu.width).toBeCloseTo(56, 0);
    expect(shown.menu.height).toBeCloseTo(56, 0);
    expect(shown.menu.x + shown.menu.width).toBeCloseTo(shown.own.x + shown.own.width, 0);
    expect(shown.menu.y).toBeLessThan(2 * REM);
    // the title just left of it, level with it
    expect(shown.title.x + shown.title.width).toBeLessThanOrEqual(shown.menu.x + 1);
    expect(shown.menu.x - (shown.title.x + shown.title.width)).toBeLessThan(2 * REM);
    expect(shown.title.y + shown.title.height / 2).toBeCloseTo(shown.menu.y + shown.menu.height / 2, 0);
    // the readings' centre is within 1 rem of the main frame's centre
    const readingsCentre = shown.readings.x + shown.readings.width / 2;
    expect(Math.abs(readingsCentre - (shown.frame.x + shown.frame.width / 2))).toBeLessThan(REM);
    expect(shown.entries).toEqual(home.entries);
  }
  for (const other of [steam, water]) {
    // The button and the title in the same place on all three pages.
    expect(other.menu.x).toBeCloseTo(home.menu.x, 0);
    expect(other.menu.y).toBeCloseTo(home.menu.y, 0);
    expect(other.title.x + other.title.width).toBeCloseTo(home.title.x + home.title.width, 0);
  }

  // No state word, no dot, no back arrow; the menu is a bare icon.
  for (const shown of [home, steam, water]) {
    await expect(shown.header.getByTestId('status-word')).toHaveCount(0);
    await expect(shown.header.getByTestId('status-fault')).toHaveCount(0);
    await expect(shown.header.getByTestId('status-title')).toHaveCount(0);
  }
  for (const shown of [home, steam, water]) expect(shown.bare).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)' });
  await expect(page.getByTestId('nav-home')).toHaveCount(0);
  expect(errors).toEqual([]);
});
