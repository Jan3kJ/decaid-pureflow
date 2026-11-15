import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The history's handle and the page dots are only a hint for a swipe, and their target is larger
// than the mark drawn: they take no press glow, while a real button still does.

test.use({ viewport: { width: 1280, height: 800 } });

const look = (locator: Locator) =>
  locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return { shadow: style.boxShadow, border: style.borderColor };
  });

/** Holds the pointer on the control, reads it, lets go beside it and reads it again 150 ms later. */
async function staysPlain(page: Page, control: Locator) {
  const rest = await look(control);
  expect(rest.shadow).toBe('none');
  const box = (await control.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await look(control)).toEqual(rest);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await look(control)).toEqual(rest);
}

test('the history handle shows no press glow and still opens the history', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  const handle = page.getByTestId('history-handle');
  await expect(handle).toBeEnabled();
  await staysPlain(page, handle);
  await handle.tap();
  await expect(page.getByTestId('history')).toBeVisible();
});

test('each page dot shows no press glow and still slides to its page', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  const dots = page.locator('[data-testid^="page-dot-"]');
  await expect(dots).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const dot = dots.nth(i);
    await expect(dot).toBeEnabled();
    await staysPlain(page, dot);
    const name = (await dot.getAttribute('data-testid'))!.replace('page-dot-', '');
    await dot.tap();
    await expect(page.getByTestId(`screen-${name}`)).toBeVisible();
    await expect(dot).toHaveAttribute('aria-current', 'page');
  }
});

test("steam's set timer still glows while it is pressed", async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.putOnScale(525);
  const timer = page.getByTestId('steam-set-timer');
  await expect(timer).toBeEnabled();
  const box = (await timer.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await look(timer)).shadow).not.toBe('none');
  await page.mouse.move(1, 1);
  await page.mouse.up();
});
