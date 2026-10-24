import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { swipe } from './touch';

// Swipe only: the tabs go (X4, spec 3.11, acceptance item 70). Home has no edge tabs and uses
// the full width; three page dots in the bottom padding of hot water, home and steam show the
// current page and slide to theirs on a tap; a thin handle at home's left edge opens the history.

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

/** The shown page: the one screen that is not a page sliding in. */
const shown = (page: Page, screen: string) => page.locator(`.page:not([inert]) [data-testid="screen-${screen}"]`);

/** The page at rest after a slide: one page in the strip, and it is `screen`. */
async function rests(page: Page, screen: string) {
  await expect(shown(page, screen)).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
}

const PAGES = ['hot-water', 'home', 'steam'];

test('home draws no edge tab and uses the full width', async ({ page }) => {
  await mockGateway(page);
  await home(page);
  for (const id of ['open-steam', 'open-hot-water', 'nav-history']) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.locator('.page nav')).toHaveCount(0);
  const screen = (await page.getByTestId('screen-home').boundingBox())!;
  expect(screen.x).toBe(0);
  expect(screen.width).toBe(1280);
  // The menu opens under its button, in the top left corner (spec 3.14).
  const button = (await page.getByTestId('menu').boundingBox())!;
  await page.getByTestId('menu').click();
  const menu = (await page.getByTestId('menu-list').boundingBox())!;
  expect(Math.abs(menu.x - button.x)).toBeLessThan(2);
  expect(menu.y).toBeGreaterThan(button.y + button.height - 1);
  await page.getByTestId('menu-backdrop').click({ position: { x: 1100, y: 400 } });
  await page.screenshot({ path: 'docs/product/home-no-tabs.png' });
  expect(errors).toEqual([]);
});

test('three dots in the bottom padding, the current one bright, each a finger’s target', async ({ page }) => {
  await mockGateway(page);
  await home(page);
  for (const screen of PAGES) {
    await page.getByTestId(`page-dot-${screen}`).tap();
    await rests(page, screen);
    const boxes = [];
    for (const dot of PAGES) {
      const button = page.getByTestId(`page-dot-${dot}`);
      await expect(button).toHaveCount(1);
      if (dot === screen) await expect(button).toHaveAttribute('aria-current', 'page');
      else await expect(button).not.toHaveAttribute('aria-current');
      boxes.push((await button.boundingBox())!);
    }
    // In a row, left to right as the pages lie, at the bottom and the middle of the screen.
    expect(boxes[0].x).toBeLessThan(boxes[1].x);
    expect(boxes[1].x).toBeLessThan(boxes[2].x);
    for (const box of boxes) {
      expect(box.y + box.height).toBeGreaterThan(800 - 2);
      expect(box.width).toBeGreaterThanOrEqual(40);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    expect(Math.abs(boxes[1].x + boxes[1].width / 2 - 640)).toBeLessThan(2);
    // Bright and dim: the current dot is drawn in the text colour, the others not.
    const colours = await Promise.all(
      PAGES.map((dot) =>
        page
          .getByTestId(`page-dot-${dot}`)
          .locator('span')
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      ),
    );
    expect(new Set(colours).size).toBe(2);
    expect(colours.filter((colour) => colour === colours[PAGES.indexOf(screen)])).toHaveLength(1);
    // Nothing of the page lies under the dots: its content ends above them.
    const content = (await page.getByTestId(`screen-${screen}`).locator(':scope > *').first().boundingBox())!;
    expect(content.y + content.height).toBeLessThanOrEqual(800 - 25);
  }
  expect(errors).toEqual([]);
});

test('a tap on a dot slides to its page, across home too; the current dot does nothing', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);

  await page.getByTestId('page-dot-home').tap();
  await rests(page, 'home');
  await page.getByTestId('page-dot-steam').tap();
  // It slides: the steam page comes in beside home before it is the page.
  await expect(page.locator('.page')).toHaveCount(2);
  await rests(page, 'steam');
  // From steam to hot water, across home: the strip holds all three while it slides.
  await page.getByTestId('page-dot-hot-water').tap();
  await expect(page.locator('.page')).toHaveCount(3);
  await rests(page, 'hot-water');
  await page.getByTestId('page-dot-home').tap();
  await rests(page, 'home');
  // The pages a dot reaches are those a swipe reaches: a swipe still works after them.
  await swipe(page, { x: 800, y: 500 }, { x: 300, y: 500 });
  await rests(page, 'steam');
  expect(gateway.writes()).toEqual([]);
  expect(errors).toEqual([]);
});

test('with reduced motion a dot changes the page at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockGateway(page);
  await home(page);
  await page.getByTestId('page-dot-steam').tap();
  await rests(page, 'steam');
  expect(errors).toEqual([]);
});

test("the history's handle: a thin bar at home's left edge, vertically centred, that opens the history", async ({ page }) => {
  await mockGateway(page);
  await home(page);
  const handle = page.getByTestId('history-handle');
  const box = (await handle.boundingBox())!;
  expect(box.x).toBe(0);
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(2);
  expect(box.width).toBeGreaterThanOrEqual(40);
  expect(box.height).toBeGreaterThanOrEqual(56);
  // The bar itself is thin.
  const bar = (await handle.locator('span').boundingBox())!;
  expect(bar.width).toBeLessThan(8);
  await handle.tap();
  await expect(page.getByTestId('history')).toBeVisible();
  await expect(shown(page, 'home')).toBeVisible();
  // Only on home; no page has a back arrow (spec 3.14).
  await page.touchscreen.tap(1100, 400);
  await expect(page.getByTestId('history')).toHaveCount(0);
  await page.getByTestId('page-dot-steam').tap();
  await rests(page, 'steam');
  await expect(page.getByTestId('history-handle')).toHaveCount(0);
  await expect(page.getByTestId('nav-home')).toHaveCount(0);
  expect(errors).toEqual([]);
});
