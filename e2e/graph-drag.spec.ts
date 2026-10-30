import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// A dragged line in the A-Flow editor keeps the finger until it lifts:
// a touch on a line is the graph's, the browser starts no pan for it, and a cancelled
// pointer ends the drag where the finger last set the value.

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await mockGateway(page).then((gateway) => gateway.withDefaults('light'));
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  // Every pointercancel on the page is counted.
  await page.evaluate(() => {
    const counted = window as unknown as { cancels: number };
    counted.cancels = 0;
    window.addEventListener('pointercancel', () => (counted.cancels += 1), true);
  });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** The middle of a level line on the page, from the stretch the graph marks for it. */
async function middleOf(page: Page, field: string): Promise<{ x: number; y: number }> {
  return page.locator(`line.level[data-field="${field}"]`).evaluate((line) => {
    const rect = line.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

const number = async (page: Page, testid: string) => parseFloat((await page.getByTestId(testid).textContent())!);
const cancels = (page: Page) => page.evaluate(() => (window as unknown as { cancels: number }).cancels);

for (const field of ['fillTemperature', 'infusePressure', 'pourFlow']) {
  test(`a finger drags the ${field} line down and up by 60 px in small steps to the end, and no pointercancel arrives`, async ({
    page,
  }) => {
    const start = await number(page, `value-${field}`);
    const from = await middleOf(page, field);
    const cdp = await page.context().newCDPSession(page);
    const touchAt = (y: number) => [{ x: from.x, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchAt(from.y) });
    // Down by 60 px, 2 px at a time.
    let early = start;
    for (let i = 1; i <= 30; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchAt(from.y + 2 * i) });
      await page.waitForTimeout(10);
      if (i === 5) early = await number(page, `value-${field}`);
    }
    await expect(page.getByTestId('popup')).toBeVisible();
    const bottom = await number(page, `value-${field}`);
    expect(bottom).toBeLessThan(early);
    expect(early).toBeLessThanOrEqual(start);
    // And up by 60 px: the line comes back to where it was.
    for (let i = 29; i >= 0; i -= 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchAt(from.y + 2 * i) });
      await page.waitForTimeout(10);
    }
    await expect(page.getByTestId('popup')).toBeVisible();
    expect(await number(page, `value-${field}`)).toBe(start);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await expect(page.getByTestId('popup')).toHaveCount(0);
    expect(await cancels(page)).toBe(0);
  });
}

test('a touch that goes down on a line is kept from the browser, one off the lines is not', async ({ page }) => {
  const line = await middleOf(page, 'fillTemperature');
  // Under the plot, on a step's name: away from every line and border.
  const column = (await page.getByTestId('column-infuse').boundingBox())!;
  const off = { x: column.x + column.width / 2, y: column.y + column.height - 10 };
  const prevented = (point: { x: number; y: number }) =>
    page.getByTestId('graph').evaluate((svg, { x, y }) => {
      const touch = new Touch({ identifier: 1, target: svg, clientX: x, clientY: y });
      const event = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touch],
        targetTouches: [touch],
        changedTouches: [touch],
      });
      svg.dispatchEvent(event);
      return event.defaultPrevented;
    }, point);
  expect(await prevented(line)).toBe(true);
  expect(await prevented(off)).toBe(false);
});

test('a pointercancel during a drag ends it where the finger last set the value', async ({ page }) => {
  const start = await number(page, 'value-infusePressure');
  const from = await middleOf(page, 'infusePressure');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 40, { steps: 8 });
  await expect(page.getByTestId('popup')).toBeVisible();
  const set = await number(page, 'value-infusePressure');
  expect(set).toBeGreaterThan(start);

  await page
    .getByTestId('graph')
    .evaluate((svg) => svg.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await expect(page.getByTestId('popup')).toHaveCount(0);
  // The finger's further moves set nothing.
  await page.mouse.move(from.x, from.y + 40, { steps: 8 });
  await page.mouse.up();
  expect(await number(page, 'value-infusePressure')).toBe(set);
});
