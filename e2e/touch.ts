import { expect, type Page } from '@playwright/test';

/**
 * A finger's swipe, as the tablet's screen sends it: touch events through the browser's input,
 * over a quarter of a second. Sent with no time between them they are a fling so fast that
 * Chromium drops the tap that follows it (research.md, section 14).
 */
export async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 8; i += 1) {
    const at = { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * Detail mode: a tap on a step of the editor's graph selects it; there are no phase buttons
 * (founder, 2026-10-16). It taps the step's name under the plot, away from every line.
 */
export async function selectPhase(page: Page, phase: string) {
  const column = (await page.getByTestId(`column-${phase}`).boundingBox())!;
  await page.mouse.click(column.x + column.width / 2, column.y + column.height - 10);
}

/**
 * A tap on a page's dot (spec 3.11), waited until the page is at rest: the dot slides to it, and
 * while it slides both pages are drawn.
 */
export async function toPage(page: Page, to: 'home' | 'steam' | 'hot-water') {
  await page.getByTestId(`page-dot-${to}`).tap();
  await expect(page.locator(`.page:not([inert]) [data-testid="screen-${to}"]`)).toBeVisible();
  await expect(page.locator('.page')).toHaveCount(1);
}
