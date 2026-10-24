import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The turn-on chip of a collapsed step has a lane of its own: the phase-name row under the
// axis. No two chips of the editor's graph overlap, whichever steps are collapsed.

const errors: string[] = [];

async function open(page: Page, width: number) {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  // Landscape, as the tablet: a portrait viewport is turned.
  await page.setViewportSize({ width, height: Math.round(width * 0.625) });
  await mockGateway(page).then((gateway) => gateway.withDefaults('light'));
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
}

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Drags the right border of a phase past its left one: the phase collapses to 0 s. */
async function collapse(page: Page, phase: string) {
  const graph = (await page.getByTestId('graph').boundingBox())!;
  const column = (await page.getByTestId(`column-${phase}`).boundingBox())!;
  const from = { x: column.x + column.width, y: graph.y + graph.height * 0.62 };
  const dx = -(column.width + 40);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y, { steps: 4 });
  await page.mouse.up();
  expect((await page.getByTestId(`column-${phase}`).boundingBox())!.width).toBe(0);
  await expect(page.getByTestId(`enable-${phase}`)).toBeVisible();
}

/** Every chip on the graph: the two weights and the turn-on buttons. */
async function chipBoxes(page: Page) {
  const chips = page.locator(
    '[data-testid="chip-graph-infuseWeight"], [data-testid="chip-graph-stopWeight"], [data-testid^="enable-"]',
  );
  const boxes: { id: string; x: number; y: number; width: number; height: number }[] = [];
  for (const chip of await chips.all()) boxes.push({ id: (await chip.getAttribute('data-testid'))!, ...(await chip.boundingBox())! });
  return boxes;
}

async function expectNoOverlap(page: Page) {
  // The lane settles once the buttons are measured.
  await page.waitForTimeout(100);
  const graph = (await page.getByTestId('graph').boundingBox())!;
  const boxes = await chipBoxes(page);
  for (const [i, a] of boxes.entries()) {
    expect(a.x, `${a.id} inside the graph`).toBeGreaterThanOrEqual(graph.x - 0.5);
    expect(a.x + a.width, `${a.id} inside the graph`).toBeLessThanOrEqual(graph.x + graph.width + 0.5);
    for (const b of boxes.slice(i + 1)) {
      const apart =
        a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5;
      expect(apart, `${a.id} and ${b.id} overlap: ${JSON.stringify([a, b])}`).toBe(true);
    }
  }
  return boxes;
}

/** The vertical middle of the phase names printed under the axis. */
async function nameRow(page: Page): Promise<number> {
  const name = (await page.locator('[data-testid="graph"] text.phase').first().boundingBox())!;
  return name.y + name.height / 2;
}

for (const width of [1280, 600]) {
  test(`${width} px: no two chips overlap for any collapsed steps; the turn-on chip is in the name row`, async ({ page }) => {
    await open(page, width);
    await expectNoOverlap(page);

    // Pressurize collapses at the infuse's end, where the infuse-to chip is.
    await collapse(page, 'pressurize');
    await expect(page.getByTestId('chip-graph-infuseWeight')).toBeVisible();
    await expectNoOverlap(page);
    const row = await nameRow(page);
    const chip = (await page.getByTestId('enable-pressurize').boundingBox())!;
    expect(chip.y).toBeLessThanOrEqual(row);
    expect(chip.y + chip.height).toBeGreaterThanOrEqual(row);

    // Both collapsed at one place: side by side.
    await collapse(page, 'infuse');
    await expectNoOverlap(page);

    // Infuse alone.
    await page.getByTestId('enable-pressurize').click();
    await expect(page.getByTestId('enable-pressurize')).toHaveCount(0);
    await expect(page.getByTestId('value-rampTime')).toHaveText('5 s');
    await expectNoOverlap(page);

    // With the 2nd fill on, the two collapse at two places.
    await page.getByTestId('enable-infuse').click();
    await page.getByTestId('toggle-second-fill').click();
    await expect(page.getByTestId('toggle-second-fill')).toHaveAttribute('aria-pressed', 'true');
    await collapse(page, 'pressurize');
    await expectNoOverlap(page);
    await collapse(page, 'infuse');
    await expectNoOverlap(page);
    await page.getByTestId('enable-infuse').click();
    await expect(page.getByTestId('value-infuseTime')).toHaveText('5 s');
    await expectNoOverlap(page);
  });
}
