import { expect, test, type Page } from '@playwright/test';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const points = (page: Page, line: 'flow' | 'pressure') =>
  page.getByTestId(`line-${line}`).getAttribute('points');

/** The middle of a level line on the page, from the stretch the graph marks for it. */
async function middleOf(page: Page, field: string): Promise<{ x: number; y: number }> {
  return page.locator(`line.level[data-field="${field}"]`).evaluate((line) => {
    const rect = line.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

test('loads in simple mode with no console errors', async ({ page }) => {
  await expect(page.getByTestId('mode-simple')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);
  await expect(page.getByTestId('value-infusePressure')).toHaveText('3 bar');
  await page.screenshot({ path: 'docs/product/simple.png' });
});

test('simple mode: dragging a level line changes the value and the curve', async ({ page }) => {
  const before = await points(page, 'pressure');
  const from = await middleOf(page, 'infusePressure');

  await page.mouse.move(from.x, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 40, { steps: 5 });
  await expect(page.getByTestId('popup')).toContainText('infuse pressure');
  await page.mouse.move(from.x, from.y - 80, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId('popup')).toHaveCount(0);
  const text = await page.getByTestId('value-infusePressure').textContent();
  expect(parseFloat(text!)).toBeGreaterThan(3);
  expect(parseFloat(text!)).toBeLessThanOrEqual(12);
  expect(await points(page, 'pressure')).not.toBe(before);
});

test('simple mode: dragging a phase border changes a duration', async ({ page }) => {
  await page.getByTestId('profile-default-dark').click();
  await expect(page.getByTestId('value-rampTime')).toHaveText('5 s');
  const before = await points(page, 'pressure');
  const box = (await page.getByTestId('graph').boundingBox())!;
  // The pour pressure line begins on the border between pressurize and flow.
  const x = await page
    .locator('line.level[data-field="pourPressure"]')
    .evaluate((line) => line.getBoundingClientRect().left);
  const y = box.y + box.height * 0.62;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 5 });
  await expect(page.getByTestId('popup')).toContainText('ramp time');
  await page.mouse.up();

  const seconds = parseFloat((await page.getByTestId('value-rampTime').textContent())!);
  expect(seconds).toBeGreaterThan(5);
  expect(await points(page, 'pressure')).not.toBe(before);
});

test('simple mode: a weight chip on the graph opens and steps', async ({ page }) => {
  const chip = page.getByTestId('chip-graph-stopWeight');
  await expect(chip).toContainText('48 g');
  await chip.locator('.body').click();
  await chip.locator('[data-step="minus"]').click();
  await expect(chip).toContainText('47 g');
});

test('detail mode: a chip changes the value and the curve', async ({ page }) => {
  await page.getByTestId('mode-detail').click();
  await page.getByTestId('phase-pressurize').click();
  await expect(page.getByTestId('highlight-pressurize')).toBeVisible();
  await page.screenshot({ path: 'docs/product/detail.png' });

  const before = await points(page, 'pressure');
  const chip = page.getByTestId('chip-pourPressure');
  await expect(page.getByTestId('chip-value-pourPressure')).toHaveText('9.5 bar');
  await chip.locator('[data-step="minus"]').click();
  await chip.locator('[data-step="minus"]').click();
  await expect(page.getByTestId('chip-value-pourPressure')).toHaveText('9.3 bar');
  await expect(page.getByTestId('value-pourPressure')).toHaveText('9.3 bar');
  expect(await points(page, 'pressure')).not.toBe(before);

  // Tapping a column of the graph selects its phase.
  const flow = await middleOf(page, 'pourFlow');
  await page.mouse.click(flow.x, flow.y);
  await expect(page.getByTestId('phase-flow')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('chip-stopWeight')).toBeVisible();
});

test('both toggles work', async ({ page }) => {
  const flowBefore = await points(page, 'flow');
  const toggle = page.getByTestId('toggle-flow');
  await expect(toggle).toHaveText(/flow up/);
  await toggle.click();
  await expect(toggle).toHaveText(/flow down/);
  const flowDown = await points(page, 'flow');
  expect(flowDown).not.toBe(flowBefore);

  const second = page.getByTestId('toggle-second-fill');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('line.level[data-field="secondFillFlow"]')).toHaveCount(0);
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('line.level[data-field="secondFillFlow"]')).toHaveCount(1);
  await expect(page.getByTestId('value-pauseDuration')).toHaveText('pause 15 s');
  expect(await points(page, 'flow')).not.toBe(flowDown);

  // The step list is the generator's: it gains 2nd Fill and Pause.
  await page.getByTestId('toggle-steps').click();
  await expect(page.getByTestId('steps')).toContainText('2nd Fill');
  await expect(page.getByTestId('steps')).toContainText('Pause');
  await page.screenshot({ path: 'docs/product/steps.png' });
  await second.click();
  await expect(page.getByTestId('steps')).not.toContainText('Pause');
});
