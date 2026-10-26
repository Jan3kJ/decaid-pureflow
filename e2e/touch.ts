import { expect, type Page } from '@playwright/test';

/**
 * A finger's swipe, as the tablet's screen sends it: touch events through the browser's input,
 * over a quarter of a second. Sent with no time between them they are a fling so fast that
 * Chromium drops the tap that follows it (research.md, section 14). With `hold`, the finger rests
 * at the end that many milliseconds before it lifts: no fling, so a tap after it is never dropped.
 */
export async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold = 0) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 8; i += 1) {
    const at = { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
    await page.waitForTimeout(30);
  }
  if (hold) {
    await page.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * A flick: a quick swipe that lifts the finger right after its last move, so that the speed a
 * screen reads at the lift is the swipe's even on a slow machine.
 */
export async function flick(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 8; i += 1) {
    if (i > 1) await page.waitForTimeout(16);
    const at = { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
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

/**
 * The way back (spec 3.14): no screen has a back arrow; a swipe from left to right leaves a
 * screen for where it was opened from, and on the hot water page, the leftmost, a swipe from right
 * to left goes home. It starts on the first place, from the top, that is not on or near (Chromium
 * moves a touch to a control close by) a field, a drag of its own or a row that scrolls sideways
 * (the rule of `onControl`).
 * Waited until the slide has settled.
 */
export async function back(page: Page) {
  // A swipe while the strip still slides is not taken.
  await expect(page.locator('.page.settling')).toHaveCount(0);
  await expect(page.locator('.page')).toHaveCount(1);
  const from = await page.locator('.page:not([inert]) > .screen').getAttribute('data-testid');
  const { width, height } = page.viewportSize()!;
  const way = from === 'screen-hot-water' ? -1 : 1;
  const start = await page.evaluate(
    ({ xs, height }) => {
      const free = (x: number, y: number) => {
        for (let node = document.elementFromPoint(x, y); node && node.tagName !== 'MAIN'; node = node.parentElement) {
          if (node.matches('input, textarea, select, [role="dialog"], [data-no-swipe], [data-own-swipe]')) return false;
          // The editor's graph says where it drags (src/shell/swipe.ts, `dragsOnly`).
          const drags = (node as Element & { drags?: (point: { x: number; y: number }) => boolean }).drags;
          if (drags) {
            if (drags({ x, y })) return false;
            continue;
          }
          const css = getComputedStyle(node);
          if (css.touchAction === 'none') return false;
          if (/auto|scroll/.test(css.overflowX) && node.scrollWidth > node.clientWidth) return false;
        }
        return true;
      };
      const clear = (x: number, y: number) => [-24, 0, 24].every((d) => free(x, Math.min(height - 1, Math.max(0, y + d))));
      for (let y = 8; y < height; y += 8) for (const x of xs) if (clear(x, y)) return { x, y };
      throw new Error('no place to swipe back from');
    },
    { xs: (way > 0 ? [0.3, 0.4, 0.5, 0.7] : [0.8, 0.7, 0.6]).map((share) => width * share), height },
  );
  await swipe(page, start, { x: Math.min(width - 2, start.x + way * width * 0.45), y: start.y }, 120);
  await expect(page.locator('.page.settling')).toHaveCount(0);
  await expect(page.locator('.page')).toHaveCount(1);
}
