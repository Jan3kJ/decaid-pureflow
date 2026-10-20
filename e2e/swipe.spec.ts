import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { swipe } from './touch';

// The row of pages (spec 3.8, acceptance item 32): hot water, home and steam from left to
// right, a swipe slides to the neighbour; the edge tabs stay, the history's swipe stays, and a
// drag on a control moves no page.

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
  await swipe(page, { x: 400, y: 500 }, { x: 900, y: 500 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  await swipe(page, { x: 900, y: 500 }, { x: 400, y: 500 });
  await expect(shown(page, 'home')).toBeVisible();

  // A short move springs back; a move down is not a swipe.
  await swipe(page, { x: 800, y: 500 }, { x: 760, y: 500 });
  await swipe(page, { x: 800, y: 200 }, { x: 820, y: 600 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'home')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(gateway.requests.filter((request) => request.method !== 'GET')).toEqual([]);
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

test("the edge tabs still open steam and hot water, and the history's swipe the history", async ({ page }) => {
  await mockGateway(page);
  await home(page);
  await page.getByTestId('open-steam').tap();
  await expect(shown(page, 'steam')).toBeVisible();
  await page.getByTestId('nav-home').tap();
  await page.getByTestId('open-hot-water').tap();
  await expect(shown(page, 'hot-water')).toBeVisible();
  await page.getByTestId('nav-home').tap();

  // The history's swipe from home's left fifth: the overlay, no page.
  await swipe(page, { x: 10, y: 400 }, { x: 260, y: 420 });
  await expect(page.getByTestId('history')).toBeVisible();
  await expect(shown(page, 'home')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a swipe that begins on a button slides the page and presses nothing', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-steam').tap();
  const tare = (await page.getByTestId('steam-tare').boundingBox())!;
  const y = tare.y + tare.height / 2;
  await swipe(page, { x: tare.x + tare.width / 2 - 400, y }, { x: tare.x + tare.width / 2, y });
  await expect(shown(page, 'home')).toBeVisible();
  expect(gateway.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  expect(errors).toEqual([]);
});

test('a drag on a control moves no page: a slider, the number pad', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-hot-water').tap();
  await expect(shown(page, 'hot-water')).toBeVisible();

  // A slider on the page (the hot water page's own come with its rows, spec 3.9 item 11).
  await page.getByTestId('screen-hot-water').evaluate((screen) => {
    const slider = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: '100', value: '100' });
    slider.dataset.testid = 'slider';
    slider.style.cssText = 'position: fixed; left: 200px; top: 400px; width: 600px; height: 60px; z-index: 5';
    screen.append(slider);
  });
  await swipe(page, { x: 780, y: 430 }, { x: 220, y: 430 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
  expect(Number(await page.getByTestId('slider').inputValue())).toBeLessThan(50);

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
