import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  // The editor is one screen of the shell: open the skin on it, with a gateway that answers.
  await mockGateway(page);
  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  // The tests start from default-light; the first default, floral, has the 2nd fill on.
  await page.getByTestId('profile-default-light').click();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const pressurePoints = (page: Page) => page.getByTestId('line-pressure').getAttribute('points');
const flowPath = (page: Page) => page.getByTestId('line-flow').getAttribute('d');

/** The middle of a level line on the page, from the stretch the graph marks for it. */
async function middleOf(page: Page, field: string): Promise<{ x: number; y: number }> {
  return page.locator(`line.level[data-field="${field}"]`).evaluate((line) => {
    const rect = line.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

async function column(page: Page, phase: string) {
  return (await page.getByTestId(`column-${phase}`).boundingBox())!;
}

/** A point on the right border of a phase, away from every line. */
async function borderOf(page: Page, phase: string): Promise<{ x: number; y: number }> {
  const graph = (await page.getByTestId('graph').boundingBox())!;
  const box = await column(page, phase);
  return { x: box.x + box.width, y: graph.y + graph.height * 0.62 };
}

async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
}

const number = async (page: Page, testid: string) =>
  parseFloat((await page.getByTestId(testid).textContent())!.replace('pause', ''));

async function type(page: Page, field: string, keys: string) {
  await page.getByTestId(`chip-edit-${field}`).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
}

test('loads in simple mode with no console errors, the five defaults in order', async ({ page }) => {
  await expect(page.getByTestId('mode-simple')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);
  await expect(page.getByTestId('value-infusePressure')).toHaveText('3 bar');
  await expect(page.getByTestId('picker').getByRole('button')).toHaveText([
    'floral',
    'light',
    'medium',
    'dark',
    '46mm',
  ]);
  // floral is what the editor opens with.
  await page.getByTestId('profile-default-floral').click();
  await expect(page.getByTestId('value-pauseDuration')).toHaveText('pause 15 s');
  await page.screenshot({ path: 'docs/product/simple.png' });
});

test('the layout stays inside the viewport and every column is wide enough for a finger', async ({
  page,
}) => {
  const viewport = page.viewportSize()!;
  for (const mode of ['simple', 'detail']) {
    await page.getByTestId(`mode-${mode}`).click();
    for (const id of ['floral', 'light', 'medium', 'dark', '46mm']) {
      await page.getByTestId(`profile-default-${id}`).click();
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      expect(size).toEqual(viewport);
      const steps = (await page.getByTestId('steps').boundingBox())!;
      expect(steps.y + steps.height).toBeLessThanOrEqual(viewport.height);
      for (const columnBox of await page.locator('rect.column').all()) {
        expect((await columnBox.boundingBox())!.width).toBeGreaterThanOrEqual(48);
      }
    }
  }
  // The longest panel, six values and the dose, fits without scrolling.
  await page.getByTestId('phase-flow').click();
  const panel = page.getByTestId('detail-panel');
  expect(await panel.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
});

test('the time axis follows the set times: thin fill, wide infusion, the rest for the flow', async ({
  page,
}) => {
  // light: 60 s of infusion against a fill of 3 to 4 s.
  expect((await column(page, 'infuse')).width).toBeGreaterThan(
    4 * (await column(page, 'fill')).width,
  );
  const lightFlow = (await column(page, 'flow')).width;
  // dark: 10 s of infusion and 5 s of ramp leave most of the graph to the flow phase.
  await page.getByTestId('profile-default-dark').click();
  const infuse = (await column(page, 'infuse')).width;
  const pressurize = (await column(page, 'pressurize')).width;
  expect(infuse / pressurize).toBeCloseTo(2, 0);
  expect((await column(page, 'flow')).width).toBeGreaterThan(2 * lightFlow);
  // The 2nd fill with its pause is about as thin as the fill.
  await page.getByTestId('toggle-second-fill').click();
  expect((await column(page, 'secondFill')).width).toBeLessThanOrEqual(
    2 * (await column(page, 'fill')).width,
  );
});

test('no flow line in the infuse phase', async ({ page }) => {
  for (const secondFill of [false, true]) {
    if (secondFill) await page.getByTestId('toggle-second-fill').click();
    const infuse = await column(page, 'infuse');
    const graph = (await page.getByTestId('graph').boundingBox())!;
    const d = (await flowPath(page))!;
    // One subpath per stretch of the line: none of them reaches into the infuse column.
    const stretches = d
      .split('M')
      .filter(Boolean)
      .map((part) => part.split('L').map((pair) => graph.x + parseFloat(pair.trim().split(' ')[0])));
    expect(stretches).toHaveLength(2);
    for (const xs of stretches) {
      const inside = Math.max(...xs) > infuse.x + 1 && Math.min(...xs) < infuse.x + infuse.width - 1;
      expect(inside).toBe(false);
    }
    await expect(page.locator('line.level.flow')).toHaveCount(secondFill ? 3 : 2);
  }
});

test('the start flow is written at the left edge of the flow phase, in both modes', async ({
  page,
}) => {
  for (const mode of ['simple', 'detail']) {
    await page.getByTestId(`mode-${mode}`).click();
    const flow = await column(page, 'flow');
    const label = (await page.getByTestId('value-pourFlow').boundingBox())!;
    await expect(page.getByTestId('value-pourFlow')).toHaveText('3 ml/s');
    expect(label.x).toBeGreaterThanOrEqual(flow.x);
    expect(label.x).toBeLessThan(flow.x + 20);
    // Under the left end of the label is the start of the line.
    const line = await page
      .locator('line.level[data-field="pourFlow"]')
      .evaluate((el) => (el as SVGLineElement).y1.baseVal.value);
    const graph = (await page.getByTestId('graph').boundingBox())!;
    expect(label.y + label.height).toBeLessThanOrEqual(graph.y + line);
  }
});

test('simple mode: dragging a level line changes the value and the curve', async ({ page }) => {
  const before = await pressurePoints(page);
  const from = await middleOf(page, 'infusePressure');

  await dragBy(page, { x: from.x, y: from.y + 10 }, 0, -60);
  await expect(page.getByTestId('popup')).toContainText('infuse pressure');
  await page.mouse.up();

  await expect(page.getByTestId('popup')).toHaveCount(0);
  const value = await number(page, 'value-infusePressure');
  expect(value).toBeGreaterThan(3);
  expect(value).toBeLessThanOrEqual(12);
  expect(await pressurePoints(page)).not.toBe(before);
});

test('simple mode: dragging a phase border changes a duration', async ({ page }) => {
  await page.getByTestId('profile-default-dark').click();
  await expect(page.getByTestId('value-rampTime')).toHaveText('5 s');
  const before = await pressurePoints(page);

  await dragBy(page, await borderOf(page, 'pressurize'), 40, 0);
  await expect(page.getByTestId('popup')).toContainText('pressurize time');
  await page.mouse.up();

  expect(await number(page, 'value-rampTime')).toBeGreaterThan(5);
  expect(await pressurePoints(page)).not.toBe(before);
});

test('the pause is dragged in detail mode only', async ({ page }) => {
  await page.getByTestId('toggle-second-fill').click();
  await expect(page.getByTestId('value-pauseDuration')).toHaveText('pause 15 s');

  await dragBy(page, await borderOf(page, 'secondFill'), 40, 0);
  await expect(page.getByTestId('popup')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByTestId('value-pauseDuration')).toHaveText('pause 15 s');

  // The other borders still move in simple mode.
  await dragBy(page, await borderOf(page, 'infuse'), -40, 0);
  await expect(page.getByTestId('popup')).toContainText('infuse time');
  await page.mouse.up();
  expect(await number(page, 'value-infuseTime')).toBeLessThan(60);

  await page.getByTestId('mode-detail').click();
  await dragBy(page, await borderOf(page, 'secondFill'), 40, 0);
  await expect(page.getByTestId('popup')).toContainText('pause time');
  await page.mouse.up();
  expect(await number(page, 'value-pauseDuration')).toBeGreaterThan(15);
  await expect(page.getByTestId('phase-secondFill')).toHaveAttribute('aria-pressed', 'true');
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
  await expect(page.getByTestId('column-pressurize')).toHaveClass(/selected/);

  const before = await pressurePoints(page);
  const chip = page.getByTestId('chip-pourPressure');
  await expect(page.getByTestId('chip-value-pourPressure')).toHaveText('9.5 bar');
  await chip.locator('[data-step="minus"]').click();
  await chip.locator('[data-step="minus"]').click();
  await expect(page.getByTestId('chip-value-pourPressure')).toHaveText('9.3 bar');
  await expect(page.getByTestId('value-pourPressure')).toHaveText('9.3 bar');
  expect(await pressurePoints(page)).not.toBe(before);

  // Tapping a column of the graph selects its phase.
  const flow = await column(page, 'flow');
  await page.mouse.click(flow.x + flow.width / 2, flow.y + flow.height - 10);
  await expect(page.getByTestId('phase-flow')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('chip-stopWeight')).toBeVisible();
  await page.screenshot({ path: 'docs/product/detail.png' });
});

test('detail mode lists the values of the review per phase, and the dose once', async ({ page }) => {
  await page.getByTestId('mode-detail').click();
  await page.getByTestId('toggle-second-fill').click();
  const expected: Record<string, string[]> = {
    fill: ['flow', 'move-on pressure', 'temperature', 'time'],
    infuse: ['pressure', 'time', 'move-on weight', 'temperature', 'flow limit'],
    secondFill: ['flow', 'move-on pressure', 'temperature', 'fill time', 'pause time', 'pause ends at flow under'],
    pressurize: ['target pressure', 'time', 'temperature'],
    flow: ['start flow', 'flow gradient to', 'time', 'temperature', 'stop at weight', 'max. pressure'],
  };
  const panel = page.getByTestId('detail-panel');
  for (const [phase, labels] of Object.entries(expected)) {
    await page.getByTestId(`phase-${phase}`).click();
    await expect(panel.locator('.label')).toHaveText([...labels, 'dose']);
  }
  await expect(page.getByTestId('chip-value-dose')).toHaveText('16 g');
});

// founder, 2026-10-13 (request 169): 'pause ends at flow under X (editable)', in ml/s, 1 by default.
test('detail mode: the flow the pause ends under is a value of the 2nd fill, and moves the Pause step’s exit', async ({
  page,
}) => {
  const pauseRow = page.getByTestId('steps').locator('tr', { hasText: 'Pause' });
  // floral has the 2nd fill on. Simple mode has no control for the value.
  await page.getByTestId('profile-default-floral').click();
  await expect(pauseRow).toContainText('flow under 1 ml/s');
  await expect(page.getByTestId('chip-pauseExitFlow')).toHaveCount(0);
  await expect(page.getByTestId('value-pauseExitFlow')).toHaveCount(0);

  await page.getByTestId('mode-detail').click();
  await page.getByTestId('phase-secondFill').click();
  const chip = page.getByTestId('chip-pauseExitFlow');
  await expect(page.getByTestId('chip-value-pauseExitFlow')).toHaveText('1 ml/s');
  const panel = page.getByTestId('detail-panel');
  expect(await panel.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);

  const before = await page.getByTestId('steps').locator('tr').allTextContents();
  await chip.locator('[data-step="minus"]').click();
  await chip.locator('[data-step="minus"]').click();
  await expect(page.getByTestId('chip-value-pauseExitFlow')).toHaveText('0.8 ml/s');
  await expect(pauseRow).toContainText('flow under 0.8 ml/s');
  // Only the Pause step's row changed.
  const after = await page.getByTestId('steps').locator('tr').allTextContents();
  expect(after.filter((row, i) => row !== before[i])).toHaveLength(1);

  // The range of the other flows.
  await type(page, 'pauseExitFlow', '2.5');
  await expect(page.getByTestId('numpad')).toContainText('pause ends at flow under');
  await expect(page.getByTestId('numpad-range')).toHaveText('0.1 to 8 ml/s');
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('chip-value-pauseExitFlow')).toHaveText('2.5 ml/s');
  await expect(pauseRow).toContainText('flow under 2.5 ml/s');
  await page.screenshot({ path: 'e2e/.results/pause-exit-flow.png' });
});

test('detail mode: the same lines are dragged as in simple mode', async ({ page }) => {
  await page.getByTestId('mode-detail').click();
  const before = await pressurePoints(page);
  const from = await middleOf(page, 'infusePressure');

  await dragBy(page, { x: from.x, y: from.y + 8 }, 0, -50);
  await expect(page.getByTestId('popup')).toContainText('infuse pressure');
  await page.mouse.up();

  // The drag selects the phase of its line, and the panel shows the new value.
  await expect(page.getByTestId('phase-infuse')).toHaveAttribute('aria-pressed', 'true');
  const value = await number(page, 'chip-value-infusePressure');
  expect(value).toBeGreaterThan(3);
  await expect(page.getByTestId('value-infusePressure')).toHaveText(`${value} bar`);
  expect(await pressurePoints(page)).not.toBe(before);

  const flowBefore = await flowPath(page);
  const pour = await middleOf(page, 'pourFlow');
  await dragBy(page, pour, 0, -30);
  await page.mouse.up();
  expect(await number(page, 'value-pourFlow')).toBeGreaterThan(3);
  expect(await flowPath(page)).not.toBe(flowBefore);

  await dragBy(page, await borderOf(page, 'infuse'), -40, 0);
  await page.mouse.up();
  expect(await number(page, 'value-infuseTime')).toBeLessThan(60);
});

test('detail mode: the number pad types a value and respects the range', async ({ page }) => {
  await page.getByTestId('mode-detail').click();
  await page.getByTestId('phase-infuse').click();
  await expect(page.getByTestId('chip-value-infuseTime')).toHaveText('60 s');
  const before = (await column(page, 'infuse')).width;

  await type(page, 'infuseTime', '10');
  await expect(page.getByTestId('numpad')).toContainText('infuse time');
  await expect(page.getByTestId('numpad-range')).toHaveText('0 to 127 s');
  await expect(page.getByTestId('numpad-display')).toHaveText('10');
  // A time is typed in whole seconds.
  await expect(page.getByTestId('numpad-key-dot')).toBeDisabled();
  await page.screenshot({ path: 'docs/product/numpad.png' });
  await page.getByTestId('numpad-confirm').click();

  await expect(page.getByTestId('numpad')).toHaveCount(0);
  await expect(page.getByTestId('chip-value-infuseTime')).toHaveText('10 s');
  await expect(page.getByTestId('value-infuseTime')).toHaveText('10 s');
  expect((await column(page, 'infuse')).width).toBeLessThan(before);

  // Outside the range the value cannot be set.
  await type(page, 'infuseTime', '128');
  await expect(page.getByTestId('numpad-confirm')).toBeDisabled();
  await expect(page.getByTestId('numpad-range')).toHaveClass(/bad/);
  await page.getByTestId('numpad-back').click();
  await page.getByTestId('numpad-key-7').click();
  await expect(page.getByTestId('numpad-display')).toHaveText('127');
  await expect(page.getByTestId('numpad-confirm')).toBeEnabled();
  await page.getByTestId('numpad-clear').click();
  await expect(page.getByTestId('numpad-display')).toHaveText('10');
  await expect(page.getByTestId('numpad-confirm')).toBeDisabled();
  await page.getByTestId('numpad-cancel').click();
  await expect(page.getByTestId('chip-value-infuseTime')).toHaveText('10 s');

  // A value with tenths, and its own range.
  await type(page, 'infusePressure', '12.5');
  await expect(page.getByTestId('numpad-range')).toHaveText('0 to 12 bar');
  await expect(page.getByTestId('numpad-confirm')).toBeDisabled();
  await page.getByTestId('numpad-clear').click();
  for (const key of ['1', 'dot', '5']) await page.getByTestId(`numpad-key-${key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('chip-value-infusePressure')).toHaveText('1.5 bar');
  await expect(page.getByTestId('value-infusePressure')).toHaveText('1.5 bar');

  // Plus and minus stay for small changes.
  await page.getByTestId('chip-infuseTime').locator('[data-step="plus"]').click();
  await expect(page.getByTestId('chip-value-infuseTime')).toHaveText('11 s');
});

test('temperatures: detail mode sets one phase, a drag in simple mode keeps the distance', async ({
  page,
}) => {
  await page.getByTestId('mode-detail').click();
  await page.getByTestId('phase-infuse').click();
  await expect(page.getByTestId('chip-value-infuseTemperature')).toHaveText('95 °C');
  // While infuse follows the fill, its temperature is written once.
  await expect(page.getByTestId('value-infuseTemperature')).toHaveCount(0);
  await type(page, 'infuseTemperature', '90');
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('value-infuseTemperature')).toHaveText('90 °C');
  await expect(page.getByTestId('value-fillTemperature')).toHaveText('95 °C');
  await expect(page.getByTestId('steps').locator('tr', { hasText: 'Infuse' })).toContainText('90 °C');

  await page.getByTestId('mode-simple').click();
  const from = await middleOf(page, 'fillTemperature');
  await dragBy(page, from, 0, 12);
  await expect(page.getByTestId('popup')).toContainText('fill temperature');
  await page.mouse.up();
  const fill = await number(page, 'value-fillTemperature');
  expect(fill).toBeLessThan(95);
  expect(await number(page, 'value-infuseTemperature')).toBe(fill - 5);
  // The flow group did not move.
  await expect(page.getByTestId('value-pourTemperature')).toHaveText('95 °C');
});

test('save as adds the profile under its name to the picker', async ({ page }) => {
  for (const mode of ['simple', 'detail']) {
    await page.getByTestId(`mode-${mode}`).click();
    await expect(page.getByTestId('save-as')).toBeVisible();
  }
  await page.getByTestId('toggle-flow').click();
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);

  await page.getByTestId('save-as').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await expect(page.getByTestId('save-confirm')).toBeDisabled();
  // A name that exists is not taken.
  await page.getByTestId('save-name').fill('Light');
  await expect(page.getByTestId('save-hint')).toHaveText('This name is in use.');
  await expect(page.getByTestId('save-confirm')).toBeDisabled();
  await page.getByTestId('save-name').fill('morning light');
  await page.getByTestId('save-confirm').click();

  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  const picker = page.getByTestId('picker').getByRole('button');
  await expect(picker).toHaveText(['floral', 'light', 'medium', 'dark', '46mm', 'morning light']);
  const saved = page.getByTestId('picker').getByRole('button', { name: 'morning light' });
  await expect(saved).toHaveAttribute('aria-pressed', 'true');

  // The default it started from is unchanged, and the saved profile has the changed value.
  await page.getByTestId('profile-default-light').click();
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow up/);
  await saved.click();
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);

  // Cancel saves nothing.
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('not this one');
  await page.getByTestId('save-cancel').click();
  await expect(picker).toHaveCount(6);
});

test('the profile steps are shown by default and stay hidden once hidden', async ({ page }) => {
  const toggle = page.getByTestId('toggle-steps');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('steps')).toBeVisible();
  const withSteps = (await page.getByTestId('graph').boundingBox())!.height;

  await toggle.click();
  await expect(page.getByTestId('steps')).toHaveCount(0);
  expect((await page.getByTestId('graph').boundingBox())!.height).toBeGreaterThan(withSteps);

  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('toggle-steps')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('steps')).toHaveCount(0);

  await page.getByTestId('toggle-steps').click();
  await page.reload();
  await expect(page.getByTestId('steps')).toBeVisible();
});

test('both toggles work', async ({ page }) => {
  const flowBefore = await flowPath(page);
  const toggle = page.getByTestId('toggle-flow');
  await expect(toggle).toHaveText(/flow up/);
  await toggle.click();
  await expect(toggle).toHaveText(/flow down/);
  const flowDown = await flowPath(page);
  expect(flowDown).not.toBe(flowBefore);

  const second = page.getByTestId('toggle-second-fill');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('line.level[data-field="secondFillFlow"]')).toHaveCount(0);
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('line.level[data-field="secondFillFlow"]')).toHaveCount(1);
  await expect(page.getByTestId('value-pauseDuration')).toHaveText('pause 15 s');
  expect(await flowPath(page)).not.toBe(flowDown);

  // The step list is the generator's: it gains 2nd Fill and Pause.
  await expect(page.getByTestId('steps')).toContainText('2nd Fill');
  await expect(page.getByTestId('steps')).toContainText('Pause');
  await second.click();
  await expect(page.getByTestId('steps')).not.toContainText('Pause');
});
