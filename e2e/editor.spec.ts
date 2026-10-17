import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';
import { selectPhase } from './touch';

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  // The editor is one screen of the shell: open the skin on it, with a gateway that answers.
  // The five defaults are in Decaid; the tests start from default-light, the loaded one. The
  // first default, floral, has the 2nd fill on.
  gateway = (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** The editor's shortcut: the picker, a tap on an A-Flow 3.0 default, and back in the editor on it. */
async function pick(page: Page, id: string) {
  await page.getByTestId('editor-profile').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await page
    .getByTestId('profile-item')
    .filter({ hasText: `A-Flow / default-${id}` })
    .filter({ hasText: 'A-Flow 3.0' })
    .click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText(id);
}

/** The profile steps panel opens closed (founder, 2026-10-13). */
async function openSteps(page: Page) {
  await page.getByTestId('toggle-steps').click();
  await expect(page.getByTestId('steps')).toBeVisible();
}

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

test('loads in simple mode with no console errors; its name leads to the picker, the five defaults in order', async ({
  page,
}) => {
  await expect(page.getByTestId('mode-simple')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);
  await expect(page.getByTestId('value-infusePressure')).toHaveText('3 bar');
  // No 'load to machine'. The row to start from holds the five defaults until the settings
  // change it (founder, 2026-10-13); the name is the shortcut to the picker.
  await expect(page.getByTestId('load-to-machine')).toHaveCount(0);
  await expect(page.getByTestId('start-row').locator('button')).toHaveText(['floral', 'light', 'medium', 'dark', '46mm']);
  await expect(page.getByTestId('start-light')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('editor-profile').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  const aflow = page.getByTestId('profile-item').filter({ hasText: 'A-Flow 3.0' });
  await expect(aflow.locator('.title')).toHaveText([
    'A-Flow / default-floral',
    'A-Flow / default-light',
    'A-Flow / default-medium',
    'A-Flow / default-dark',
    'A-Flow / default-46mm',
  ]);
  // Nothing was changed, so leaving loaded nothing.
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();
  await pick(page, 'floral');
  // The tap loaded it, once.
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);
  await expect(page.getByTestId('value-pauseDuration')).toHaveText('pause 15 s');
  await page.screenshot({ path: 'docs/product/simple.png' });
});

test('the layout stays inside the viewport and every column is wide enough for a finger', async ({
  page,
}) => {
  const viewport = page.viewportSize()!;
  for (const id of ['floral', 'light', 'medium', 'dark', '46mm']) {
    await pick(page, id);
    await openSteps(page);
    for (const mode of ['simple', 'detail']) {
      await page.getByTestId(`mode-${mode}`).click();
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
  await selectPhase(page, 'flow');
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
  // dark: 9 s of infusion (10 s, but 2 g) and 5 s of ramp leave most of the graph to the
  // flow phase; light infuses for 25 s (6 g) and ramps for 10 s.
  await pick(page, 'dark');
  const infuse = (await column(page, 'infuse')).width;
  const pressurize = (await column(page, 'pressurize')).width;
  expect(infuse / pressurize).toBeCloseTo(1.8, 1);
  expect((await column(page, 'flow')).width).toBeGreaterThan(1.5 * lightFlow);
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
  await pick(page, 'dark');
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
  await expect(page.getByTestId('column-secondFill')).toHaveClass(/selected/);
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
  await selectPhase(page, 'pressurize');
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
  await expect(page.getByTestId('column-flow')).toHaveClass(/selected/);
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
    flow: ['start flow', 'end flow', 'time', 'temperature', 'stop at weight', 'max. pressure'],
  };
  const panel = page.getByTestId('detail-panel');
  for (const [phase, labels] of Object.entries(expected)) {
    await selectPhase(page, phase);
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
  await pick(page, 'floral');
  await openSteps(page);
  await expect(pauseRow).toContainText('flow under 1 ml/s');
  await expect(page.getByTestId('chip-pauseExitFlow')).toHaveCount(0);
  await expect(page.getByTestId('value-pauseExitFlow')).toHaveCount(0);

  await page.getByTestId('mode-detail').click();
  await selectPhase(page, 'secondFill');
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
  await expect(page.getByTestId('column-infuse')).toHaveClass(/selected/);
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

// founder, 2026-10-16 (acceptance 23, first half): "end flow"; the last step's flow line is
// split in detail mode, left half start flow, right half end flow; no buttons above the graph.
test('detail mode: the left half of the last flow line drags the start flow, the right half the end flow', async ({
  page,
}) => {
  await page.getByTestId('mode-detail').click();
  // A tap on a step selects it: there are no phase buttons.
  await expect(page.locator('[data-testid^="phase-"]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'phase' })).toHaveCount(0);
  const header = (await page.locator('.editor header').boundingBox())!;
  const graph = (await page.getByTestId('graph').boundingBox())!;
  for (const button of await page.getByTestId('screen-editor').getByRole('button').all()) {
    const box = await button.boundingBox();
    if (!box || box.y < header.y + header.height) continue;
    if (box.x >= graph.x + graph.width || box.x + box.width <= graph.x) continue;
    expect(box.y + box.height).toBeGreaterThan(graph.y);
  }

  // light: start flow 3 ml/s, flow up, so the end flow follows at 6 ml/s.
  await expect(page.getByTestId('value-pourFlow')).toHaveText('3 ml/s');
  await expect(page.getByTestId('value-pourEndFlow')).toHaveText('6 ml/s');
  const flowBefore = await flowPath(page);

  await dragBy(page, await middleOf(page, 'pourEndFlow'), 0, 30);
  await expect(page.getByTestId('popup')).toContainText('end flow');
  await page.mouse.up();
  await expect(page.getByTestId('column-flow')).toHaveClass(/selected/);
  const end = await number(page, 'chip-value-pourEndFlow');
  expect(end).toBeLessThan(6);
  await expect(page.getByTestId('value-pourEndFlow')).toHaveText(`${end} ml/s`);
  await expect(page.getByTestId('chip-value-pourFlow')).toHaveText('3 ml/s');
  expect(await flowPath(page)).not.toBe(flowBefore);
  // The end flow is the label's name everywhere.
  await expect(page.getByTestId('detail-panel')).toContainText('end flow');
  await expect(page.getByTestId('detail-panel')).not.toContainText('gradient');

  await dragBy(page, await middleOf(page, 'pourFlow'), 0, -30);
  await expect(page.getByTestId('popup')).toContainText('start flow');
  await page.mouse.up();
  expect(await number(page, 'chip-value-pourFlow')).toBeGreaterThan(3);
  await expect(page.getByTestId('chip-value-pourEndFlow')).toHaveText(`${end} ml/s`);

  // Both stay inside the maximum flow of the settings, 8 ml/s by default.
  await dragBy(page, await middleOf(page, 'pourEndFlow'), 0, -600);
  await expect(page.getByTestId('popup')).toContainText('8 ml/s');
  await page.screenshot({ path: 'docs/product/detail-end-flow.png' });
  await page.mouse.up();
  await expect(page.getByTestId('chip-value-pourEndFlow')).toHaveText('8 ml/s');
  await dragBy(page, await middleOf(page, 'pourEndFlow'), 0, 600);
  await page.mouse.up();
  await expect(page.getByTestId('chip-value-pourEndFlow')).toHaveText('0 ml/s');

  // Simple mode keeps one line, the start flow's.
  await page.getByTestId('mode-simple').click();
  await expect(page.locator('line.level[data-field="pourEndFlow"]')).toHaveCount(0);
  await expect(page.getByTestId('value-pourEndFlow')).toHaveCount(0);
});

// founder, 2026-10-16 (acceptance 23, second half): the infuse is as wide as its move-on
// weight's estimate (1 g ≈ 5 s, 6 g ≈ 25 s); the infuse-to weight is dragged; a phase dragged
// to 0 s collapses and its button sets it to 5 s.
test('the infuse is drawn by its weight, and the infuse-to chip is dragged or tapped', async ({
  page,
}) => {
  // light: 60 s but 6 g, so 25 s; pressurize 10 s.
  await expect(page.getByTestId('value-infuseTime')).toHaveText('60 s');
  const ratio = async () => (await column(page, 'infuse')).width / (await column(page, 'pressurize')).width;
  expect(await ratio()).toBeCloseTo(2.5, 1);

  // A drag to the right: more grams, and the border follows the chip.
  const chip = page.getByTestId('chip-graph-infuseWeight');
  await expect(chip).toContainText('6 g');
  const before = (await column(page, 'infuse')).width;
  const body = (await chip.locator('.body').boundingBox())!;
  await dragBy(page, { x: body.x + body.width / 2, y: body.y + body.height / 2 }, 80, 0);
  await expect(page.getByTestId('popup')).toContainText('infuse move-on weight');
  await page.screenshot({ path: 'docs/product/infuse-weight.png' });
  await page.mouse.up();
  const weight = await number(page, 'chip-value-graph-infuseWeight');
  expect(weight).toBeGreaterThan(6);
  expect((await column(page, 'infuse')).width - before).toBeCloseTo(80, -1);
  // A drag does not open the chip, and leaves the time limit alone.
  await expect(chip.locator('[data-step="plus"]')).toHaveCount(0);
  await expect(page.getByTestId('value-infuseTime')).toHaveText('60 s');
  expect(await ratio()).toBeCloseTo((1 + 4 * weight) / 10, 1);

  // A drag to the left: fewer grams.
  const at = (await chip.locator('.body').boundingBox())!;
  await dragBy(page, { x: at.x + at.width / 2, y: at.y + at.height / 2 }, -120, 0);
  await page.mouse.up();
  expect(await number(page, 'chip-value-graph-infuseWeight')).toBeLessThan(weight);

  // A tap still opens its plus and minus.
  const now = await number(page, 'chip-value-graph-infuseWeight');
  await chip.locator('.body').click();
  await chip.locator('[data-step="plus"]').click();
  await expect(chip.locator('.value')).toHaveText(`${(now + 0.1).toFixed(1).replace(/\.0$/, '')} g`);
});

test('a phase dragged to 0 s collapses, and its button turns it on with 5 s', async ({ page }) => {
  const fillBefore = (await column(page, 'fill')).width;
  const infuse = await column(page, 'infuse');
  // Touching the border of an infuse drawn by its weight does not cut its time limit.
  await dragBy(page, await borderOf(page, 'infuse'), 0, 0);
  await page.mouse.up();
  await expect(page.getByTestId('value-infuseTime')).toHaveText('60 s');

  await dragBy(page, await borderOf(page, 'infuse'), -(infuse.width + 40), 0);
  await expect(page.getByTestId('popup')).toContainText('0 s');
  await page.mouse.up();
  expect((await column(page, 'infuse')).width).toBe(0);
  expect((await column(page, 'fill')).width).toBeCloseTo(fillBefore, 0);
  await expect(page.getByTestId('chip-graph-infuseWeight')).toHaveCount(0);
  await expect(page.getByTestId('enable-infuse')).toBeVisible();
  await expect(page.getByTestId('value-infusePressure')).toHaveCount(0);

  // pressurize too; both buttons sit where their phases collapsed.
  const pressurize = await column(page, 'pressurize');
  await dragBy(page, await borderOf(page, 'pressurize'), -(pressurize.width + 40), 0);
  await page.mouse.up();
  expect((await column(page, 'pressurize')).width).toBe(0);
  await expect(page.getByTestId('enable-pressurize')).toBeVisible();
  await page.screenshot({ path: 'docs/product/phase-off.png' });

  await page.getByTestId('enable-infuse').click();
  await expect(page.getByTestId('enable-infuse')).toHaveCount(0);
  await expect(page.getByTestId('value-infuseTime')).toHaveText('5 s');
  // As wide as a finger, as the fill is.
  expect((await column(page, 'infuse')).width).toBeGreaterThanOrEqual(fillBefore - 1);
  await expect(page.getByTestId('chip-graph-infuseWeight')).toBeVisible();

  // In detail mode the button selects the phase it turned on.
  await page.getByTestId('mode-detail').click();
  await page.getByTestId('enable-pressurize').click();
  await expect(page.getByTestId('column-pressurize')).toHaveClass(/selected/);
  await expect(page.getByTestId('chip-value-rampTime')).toHaveText('5 s');
  expect((await column(page, 'pressurize')).width).toBeGreaterThanOrEqual(
    (await column(page, 'fill')).width - 1,
  );
});

test('detail mode: the number pad types a value and respects the range', async ({ page }) => {
  await page.getByTestId('mode-detail').click();
  await selectPhase(page, 'infuse');
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
  await selectPhase(page, 'infuse');
  await expect(page.getByTestId('chip-value-infuseTemperature')).toHaveText('95 °C');
  // While infuse follows the fill, its temperature is written once.
  await expect(page.getByTestId('value-infuseTemperature')).toHaveCount(0);
  await type(page, 'infuseTemperature', '90');
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('value-infuseTemperature')).toHaveText('90 °C');
  await expect(page.getByTestId('value-fillTemperature')).toHaveText('95 °C');
  await openSteps(page);
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

test('the temperature axis is 80 to 100 °C and widens for a temperature outside (founder, 2026-10-14)', async ({
  page,
}) => {
  const ticks = page.getByTestId('temperature-tick');
  await expect(ticks).toHaveText(['80', '100']);
  /** pixels per °C of the axis on screen now */
  const pixelsPerDegree = async () => {
    const [low, high] = await ticks.evaluateAll((texts) =>
      texts.map((t) => ({ value: Number(t.textContent), y: t.getBoundingClientRect().top })),
    );
    return (low.y - high.y) / (high.value - low.value);
  };

  // A drag of the flow temperature from 95 °C down past the lane's lower edge, to about 75 °C.
  await expect(page.getByTestId('value-pourTemperature')).toHaveText('95 °C');
  await dragBy(page, await middleOf(page, 'pourTemperature'), 0, 20 * (await pixelsPerDegree()));
  await expect(page.getByTestId('popup')).toContainText('flow temperature');
  await page.mouse.up();
  const low = await number(page, 'value-pourTemperature');
  expect(low).toBeLessThan(80);
  expect(low).toBeGreaterThan(70);
  await expect(ticks).toHaveText([String(Math.floor((low - 1) / 5) * 5), '100']);
  // The line is drawn inside the lane, on the wider axis.
  const lane = await ticks.evaluateAll((texts) => texts.map((t) => t.getBoundingClientRect().top));
  const line = await middleOf(page, 'pourTemperature');
  expect(line.y).toBeLessThan(lane[0] + 20);
  expect(line.y).toBeGreaterThan(lane[1]);
  await page.screenshot({ path: 'docs/product/temperature-axis.png' });

  // Moved back above 80 °C, the axis narrows again and the value is kept.
  await dragBy(page, line, 0, -(90 - low) * (await pixelsPerDegree()));
  await page.mouse.up();
  const back = await number(page, 'value-pourTemperature');
  expect(back).toBeGreaterThan(80);
  await expect(ticks).toHaveText(['80', '100']);

  // A value typed in detail mode widens it the same way.
  await page.getByTestId('mode-detail').click();
  await selectPhase(page, 'fill');
  await type(page, 'fillTemperature', '102');
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('chip-value-fillTemperature')).toHaveText('102 °C');
  await expect(ticks).toHaveText(['80', '105']);
  await expect(page.getByTestId('value-pourTemperature')).toHaveText(`${back} °C`);
});

test('save as stores the profile under its name, loads it, and the picker has it', async ({ page }) => {
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
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved as “morning light” and loaded.');
  await expect(page.getByTestId('editor-profile')).toHaveText('morning light');
  expect(gateway.calls('PUT', '/api/v1/workflow').map((call) => call.body.profile.title)).toEqual([
    'A-Flow / morning light',
  ]);

  // Cancel saves nothing.
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('not this one');
  await page.getByTestId('save-cancel').click();
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);

  // The default it started from is unchanged, and the saved profile has the changed value.
  await pick(page, 'light');
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow up/);
  await page.getByTestId('editor-profile').click();
  await expect(page.getByTestId('profile-item').filter({ hasText: 'not this one' })).toHaveCount(0);
  await page.getByTestId('profile-item').filter({ hasText: 'A-Flow / morning light' }).click();
  await expect(page.getByTestId('editor-profile')).toHaveText('morning light');
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);
});

test('the profile steps are closed whenever the editor opens, and the panel is not stored', async ({ page }) => {
  const toggle = page.getByTestId('toggle-steps');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('steps')).toHaveCount(0);
  const without = (await page.getByTestId('graph').boundingBox())!.height;

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('steps')).toBeVisible();
  expect((await page.getByTestId('graph').boundingBox())!.height).toBeLessThan(without);

  // Open, then the editor opens again: by a reload, and by home and the pen.
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('toggle-steps')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('steps')).toHaveCount(0);
  await page.getByTestId('toggle-steps').click();
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('toggle-steps')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('steps')).toHaveCount(0);
  // The button is not the setting: it stays on.
  expect(await page.evaluate(() => localStorage.getItem('decaid-skin.settings'))).toBeNull();
});

test('with the setting off, the profile steps button is not shown', async ({ page }) => {
  await page.getByTestId('nav-home').click();
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('setting-show-profile-steps').click();
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('toggle-steps')).toHaveCount(0);
  await expect(page.getByTestId('steps')).toHaveCount(0);
  // On again: the button is back, the panel closed.
  await page.getByTestId('nav-home').click();
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('setting-show-profile-steps').click();
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('toggle-steps')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('steps')).toHaveCount(0);
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
  await openSteps(page);
  await expect(page.getByTestId('steps')).toContainText('2nd Fill');
  await expect(page.getByTestId('steps')).toContainText('Pause');
  await second.click();
  await expect(page.getByTestId('steps')).not.toContainText('Pause');
});

// founder, 2026-10-15: the maximum flow is a setting, 8 ml/s by default.
test('the flows of the editor follow the maximum flow of the settings', async ({ page }) => {
  await page.getByTestId('mode-detail').click();
  await selectPhase(page, 'flow');
  await type(page, 'pourFlow', '15');
  await expect(page.getByTestId('numpad-range')).toHaveText('0.1 to 8 ml/s');
  await page.getByTestId('numpad-cancel').click();

  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('decaid-skin.settings') ?? '{}');
    localStorage.setItem('decaid-skin.settings', JSON.stringify({ ...settings, maxFlow: 12 }));
  });
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await page.getByTestId('mode-detail').click();
  await selectPhase(page, 'flow');
  await type(page, 'pourFlow', '11.5');
  await expect(page.getByTestId('numpad-range')).toHaveText('0.1 to 12 ml/s');
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('chip-value-pourFlow')).toHaveText('11.5 ml/s');
  // + stops at the new maximum.
  for (let i = 0; i < 8; i++) await page.getByTestId('chip-pourFlow').locator('[data-step="plus"]').click();
  await expect(page.getByTestId('chip-value-pourFlow')).toHaveText('12 ml/s');
  // The graph's scale reaches the new maximum: no line leaves the plot.
  const graph = (await page.getByTestId('graph').boundingBox())!;
  const flow = (await page.getByTestId('line-flow').boundingBox())!;
  expect(flow.y).toBeGreaterThanOrEqual(graph.y);
});
