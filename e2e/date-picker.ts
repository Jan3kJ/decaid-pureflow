import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the date picker from its field and taps the ISO date, stepping by month to it. */
export async function pickDate(page: Page, field: Locator, iso: string) {
  await field.click();
  const picker = page.getByTestId('datepicker');
  await expect(picker).toBeVisible();
  const target = iso.slice(0, 7);
  const month = page.getByTestId('datepicker-month');
  for (let steps = 0; steps < 240; steps += 1) {
    const shown = (await month.getAttribute('data-month'))!;
    if (shown === target) break;
    const before = shown;
    await page.getByTestId(shown < target ? 'datepicker-next' : 'datepicker-prev').click();
    await expect(month).not.toHaveAttribute('data-month', before);
  }
  await page.getByTestId(`datepicker-day-${iso}`).click();
  await expect(picker).toHaveCount(0);
}

/**
 * A finger's slow drag over the date picker's day grid, `dy` pixels down (negative: up) from a
 * point `from` the grid's top left (its middle when not given), resting at the end before it
 * lifts: no flick, so the grid settles where the finger left it. `dx` slants it to the right.
 */
export async function dragGrid(page: Page, dy: number, from?: { x: number; y: number }, dx = 0) {
  const box = (await page.getByTestId('datepicker-grid').boundingBox())!;
  const start = { x: box.x + (from?.x ?? box.width / 2), y: box.y + (from?.y ?? box.height / 2) };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let i = 1; i <= 10; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start.x + (dx * i) / 10, y: start.y + (dy * i) / 10 }],
    });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
