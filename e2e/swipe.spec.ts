import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { back, swipe } from './touch';

// The row of pages: hot water, home and steam from left to
// right, a swipe slides to the neighbour; the history's swipe stays, and a drag on a control
// moves no page. There are no edge tabs: e2e/no-tabs.spec.ts has the dots
// and the history's handle.

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

/** The shown page: the one screen that is not the neighbour coming in. */
const shown = (page: Page, screen: string) => page.locator(`.page:not([inert]) [data-testid="screen-${screen}"]`);

test('a swipe moves along hot water, home and steam, and springs back at the ends', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);

  // From the middle of home to the left: steam, and back to the right: home.
  await swipe(page, { x: 800, y: 500 }, { x: 300, y: 510 });
  await expect(shown(page, 'steam')).toBeVisible();
  await expect(page.getByTestId('screen-home')).toHaveCount(0);
  // Nothing beyond steam: the page gives a little and stays.
  await swipe(page, { x: 800, y: 500 }, { x: 300, y: 500 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'steam')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  await swipe(page, { x: 300, y: 500 }, { x: 800, y: 500 });
  await expect(shown(page, 'home')).toBeVisible();

  // To the right from right of the history's fifth: hot water, and back.
  await swipe(page, { x: 400, y: 500 }, { x: 900, y: 500 });
  await expect(shown(page, 'hot-water')).toBeVisible();
  // On hot water between its sliders: a drag on one is the slider's.
  await swipe(page, { x: 400, y: 400 }, { x: 900, y: 400 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  await swipe(page, { x: 900, y: 400 }, { x: 400, y: 400 });
  await expect(shown(page, 'home')).toBeVisible();

  // A short move springs back; a move down is not a swipe.
  await swipe(page, { x: 800, y: 500 }, { x: 760, y: 500 });
  await swipe(page, { x: 800, y: 200 }, { x: 820, y: 600 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'home')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(gateway.writes()).toEqual([]);
  expect(errors).toEqual([]);
});

test('the slide follows the finger, with the neighbour beside the page', async ({ page }) => {
  await mockGateway(page);
  await home(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 500 }] });
  for (let x = 880; x >= 500; x -= 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 500 }] });
    await page.waitForTimeout(15);
  }
  // Both pages are drawn, 400 CSS pixels to the left; the steam page is only a picture yet.
  await expect(page.locator('.page')).toHaveCount(2);
  await expect(page.locator('.page[inert] [data-testid="screen-steam"]')).toHaveCount(1);
  const steam = (await page.locator('.page[inert]').boundingBox())!;
  expect(Math.round(steam.x)).toBe(1280 - 400);
  await page.screenshot({ path: 'docs/product/swipe-mid-slide.png' });

  // Back to where it began: it springs back.
  for (let x = 520; x <= 900; x += 40) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 500 }] });
    await page.waitForTimeout(15);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(400);
  await expect(shown(page, 'home')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('with reduced motion the page changes at once, without a slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockGateway(page);
  await home(page);
  await swipe(page, { x: 800, y: 500 }, { x: 300, y: 500 });
  await expect(shown(page, 'steam')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the swipe back leads home from steam and hot water, and the history's swipe opens the history", async ({ page }) => {
  await mockGateway(page);
  await home(page);
  await swipe(page, { x: 800, y: 500 }, { x: 300, y: 500 });
  await expect(shown(page, 'steam')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();
  await swipe(page, { x: 400, y: 500 }, { x: 900, y: 500 });
  await expect(shown(page, 'hot-water')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();

  // The history's swipe from home's left fifth: the overlay, no page.
  await swipe(page, { x: 10, y: 400 }, { x: 260, y: 420 });
  await expect(page.getByTestId('history')).toBeVisible();
  await expect(shown(page, 'home')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a swipe that begins on a button slides the page and presses nothing', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await swipe(page, { x: 800, y: 500 }, { x: 300, y: 500 });
  await expect(shown(page, 'steam')).toBeVisible();
  const tare = (await page.getByTestId('steam-tare').boundingBox())!;
  const y = tare.y + tare.height / 2;
  await swipe(page, { x: tare.x + tare.width / 2 - 400, y }, { x: tare.x + tare.width / 2, y });
  await expect(shown(page, 'home')).toBeVisible();
  expect(gateway.writes()).toEqual([]);
  expect(errors).toEqual([]);
});

test('a drag on a control moves no page: a slider, the number pad', async ({ page }) => {
  await mockGateway(page);
  await home(page);
  await swipe(page, { x: 400, y: 500 }, { x: 900, y: 500 });
  await expect(shown(page, 'hot-water')).toBeVisible();

  // The page's own slider, the time's: a drag along it to the left moves
  // its value, not the page. The workflow's time is 30 s.
  const slider = (await page.getByTestId('hot-water-slider-time').boundingBox())!;
  const y = slider.y + slider.height / 2;
  await swipe(page, { x: slider.x + slider.width * 0.7, y }, { x: slider.x + slider.width * 0.1, y });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(Number(await page.getByTestId('hot-water-slider-time').inputValue())).toBeLessThan(30);

  // The number pad: a drag over its keys and over its backdrop.
  await page.getByTestId('hot-water-temperature').tap();
  const pad = (await page.getByTestId('numpad').boundingBox())!;
  await swipe(page, { x: pad.x + pad.width - 20, y: pad.y + pad.height / 2 }, { x: pad.x + 20, y: pad.y + pad.height / 2 });
  await swipe(page, { x: 1200, y: 780 }, { x: 700, y: 780 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(errors).toEqual([]);
});
