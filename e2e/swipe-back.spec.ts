import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { back, flick, swipe, toPage } from './touch';

// The way back: no screen has a left column or a back arrow; a
// swipe from left to right leaves the editors, the settings, the beans screen and the picker for
// where they were opened from, and on the hot water page a swipe from right to left goes home; a
// swipe that starts on a slider or a row's swipe does not leave; the open history closes by a
// swipe to the left.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The shown screen: the one that is not the neighbour coming in. */
const shown = (page: Page, screen: string) => page.locator(`.page:not([inert]) [data-testid="screen-${screen}"]`);

/** No back arrow, and the screen uses the whole width from the left edge. */
async function noColumn(page: Page, screen: string) {
  await expect(shown(page, screen)).toBeVisible();
  await expect(page.getByTestId('nav-home')).toHaveCount(0);
  await expect(page.locator('.page > nav')).toHaveCount(0);
  const box = (await shown(page, screen).boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(1280);
}

async function fromMenu(page: Page, entry: string) {
  await page.getByTestId('menu').click();
  await page.getByTestId(entry).click();
}

test('a swipe to the right leaves the settings, the beans, the picker and the editor for where they were opened from', async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await noColumn(page, 'home');

  await fromMenu(page, 'open-settings');
  await noColumn(page, 'settings');
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();

  await fromMenu(page, 'open-beans');
  await noColumn(page, 'beans');
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();

  await page.getByTestId('open-profiles').click();
  await noColumn(page, 'profiles');
  // A drag to the right on a row is the row's: the picker stays.
  const row = (await page.getByTestId('profile-item').first().boundingBox())!;
  await swipe(page, { x: row.x + 40, y: row.y + row.height / 2 }, { x: row.x + 600, y: row.y + row.height / 2 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'profiles')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();

  // The editor's picker goes back to the editor, and the editor home.
  await page.getByTestId('open-editor').click();
  await noColumn(page, 'editor');
  await page.getByTestId('editor-profile').click();
  await expect(shown(page, 'profiles')).toBeVisible();
  await back(page);
  await expect(shown(page, 'editor')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('hot water, the leftmost page, goes home by a swipe to the left; a swipe on a slider does not leave', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'hot-water');
  await noColumn(page, 'hot-water');
  // To the right: nothing lies left of hot water.
  await swipe(page, { x: 400, y: 48 }, { x: 1000, y: 48 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  // On a slider: the slider's drag.
  const slider = (await page.locator('[data-testid^="hot-water-slider-"]').last().boundingBox())!;
  const y = slider.y + slider.height / 2;
  await swipe(page, { x: slider.x + slider.width * 0.8, y }, { x: slider.x + slider.width * 0.1, y });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();
  // Steam goes home to the right.
  await toPage(page, 'steam');
  await noColumn(page, 'steam');
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the history opens by the edge swipe to the right and closes by a swipe to the left', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await swipe(page, { x: 30, y: 400 }, { x: 300, y: 400 });
  await expect(page.getByTestId('history')).toBeVisible();
  await swipe(page, { x: 1000, y: 400 }, { x: 500, y: 400 });
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(shown(page, 'home')).toBeVisible();
  // Over the list too.
  await swipe(page, { x: 30, y: 400 }, { x: 300, y: 400 });
  const list = (await page.getByTestId('history').boundingBox())!;
  await swipe(page, { x: list.x + list.width - 40, y: 400 }, { x: list.x + 40, y: 400 });
  await expect(page.getByTestId('history')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// The swipe back on the whole screen: a list or a column
// that scrolls only down is no row that scrolls sideways, so a swipe to the right on it goes back;
// one that starts in the left 24 px goes back over anything; the editor's graph keeps only the
// drags that start on a line, a border or a chip.

type At = { x: number; y: number };

/** A point inside the element, as shares of its box. */
async function inside(page: Page, testid: string, share: At = { x: 0.5, y: 0.5 }): Promise<At> {
  const box = (await page.getByTestId(testid).first().boundingBox())!;
  return { x: box.x + box.width * share.x, y: box.y + box.height * share.y };
}

/**
 * A swipe to the right from `from`, waited until the strip has settled: one that rests at its end,
 * or a flick from a place too near the right edge for a quarter of the width.
 */
async function swipeRight(page: Page, from: At) {
  await expect(page.locator('.page.settling')).toHaveCount(0);
  await expect(page.locator('.page')).toHaveCount(1);
  const to = { x: Math.min(1278, from.x + 560), y: from.y };
  if (to.x - from.x < 1280 * 0.3) await flick(page, from, to);
  else await swipe(page, from, to, 120);
  await expect(page.locator('.page.settling')).toHaveCount(0);
  await expect(page.locator('.page')).toHaveCount(1);
}

async function goesBack(page: Page, open: () => Promise<void>, screen: string, from: () => Promise<At>, name: string) {
  await open();
  await expect(shown(page, screen)).toBeVisible();
  await swipeRight(page, await from());
  // Soft, so that one run names every place that does not go back; home again for the next.
  await expect.soft(shown(page, 'home'), `a swipe from ${name} goes back`).toBeVisible();
  if (!(await shown(page, 'home').isVisible())) await back(page);
}

test('a swipe to the right goes back from the settings, the picker and the beans page, from their columns too', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  const settings = () => fromMenu(page, 'open-settings');
  const tree = async () => {
    const box = (await page.locator('nav.tree').boundingBox())!;
    return { x: box.x + box.width * 0.5, y: box.y + box.height * 0.6 };
  };
  await goesBack(page, settings, 'settings', tree, "the settings' category column");
  await goesBack(page, settings, 'settings', () => inside(page, 'settings-content', { x: 0.5, y: 0.3 }), "the settings' content");

  const picker = () => page.getByTestId('open-profiles').click();
  await goesBack(page, picker, 'profiles', () => inside(page, 'profile-detail', { x: 0.5, y: 0.8 }), "the picker's detail");
  // From the left edge over a row: the row's own swipe yields to the edge.
  const edge = async () => ({ x: 8, y: (await inside(page, 'profile-item')).y });
  await goesBack(page, picker, 'profiles', edge, "the picker's left edge over a row");

  const at = '2026-10-01T08:00:00.000Z';
  gateway.beans.push({ id: 'bean-1', roaster: 'Roaster', name: 'A bean', archived: false, createdAt: at, updatedAt: at } as never);
  const beans = () => fromMenu(page, 'open-beans');
  const list = async () => {
    await expect(page.getByTestId('bean-row').first()).toBeVisible();
    const box = (await page.getByTestId('beans-list').boundingBox())!;
    return { x: box.x + box.width * 0.5, y: box.y + box.height * 0.8 };
  };
  await goesBack(page, beans, 'beans', list, "the beans page's list");
  await goesBack(page, beans, 'beans', () => inside(page, 'bean-form', { x: 0.5, y: 0.95 }), "the beans page's form");
  await goesBack(page, beans, 'beans', () => inside(page, 'beans-add'), "the beans page's left column");
  expect(errors).toEqual([]);
});

async function openEditor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
}

/**
 * Points on the graph more than 1.8 rem from every level line and 1.4 rem from every border (a
 * phase column's edge), with nothing but the graph under them; a margin of 0.4 rem more.
 */
async function emptyGraph(page: Page): Promise<At[]> {
  return page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const svg = document.querySelector<SVGSVGElement>('[data-testid="graph"]')!;
    const rect = svg.getBoundingClientRect();
    const lines = [...svg.querySelectorAll<SVGLineElement>('line.level')].map((line) => {
      const m = line.getScreenCTM()!;
      const a = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(m);
      const b = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(m);
      return { a, b };
    });
    const borders = [...document.querySelectorAll('[data-testid^="column-"]')].flatMap((column) => {
      const box = column.getBoundingClientRect();
      return [box.left, box.right];
    });
    const away = (x: number, y: number, { a, b }: { a: DOMPoint; b: DOMPoint }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
    };
    const points: { x: number; y: number }[] = [];
    for (let y = rect.top + rem; y < rect.bottom - rem; y += rem / 2) {
      for (let x = rect.left + 2 * rem; x < rect.right - 2 * rem; x += rem / 2) {
        const under = document.elementFromPoint(x, y);
        if (!under || !(under === svg || svg.contains(under))) continue;
        if (lines.some((line) => away(x, y, line) <= 2.2 * rem)) continue;
        if (borders.some((bx) => Math.abs(x - bx) <= 1.8 * rem)) continue;
        points.push({ x, y });
      }
    }
    return points;
  });
}

test("a swipe to the right goes back from the A-Flow editor's header, cards, start row and the graph's empty space", async ({
  page,
}) => {
  (await mockGateway(page)).withDefaults('light');
  const editor = () => page.getByTestId('open-editor').click();
  await openEditor(page);
  await swipeRight(page, await inside(page, 'editor-status'));
  await expect(shown(page, 'home'), "a swipe from the editor's header goes back").toBeVisible();

  // The start row: the page's while it fits, its own scroll while it overflows.
  await editor();
  const row = page.getByTestId('start-row');
  const overflows = await row.evaluate((node) => node.scrollWidth > node.clientWidth);
  await swipeRight(page, await inside(page, 'start-row', { x: 0.3, y: 0.5 }));
  if (overflows) {
    await expect(shown(page, 'editor'), 'the start row that overflows keeps its drag').toBeVisible();
    await back(page);
  }
  await expect(shown(page, 'home'), "a swipe from the editor's start row goes back").toBeVisible();
  // A row that fits lets the swipe through.
  await editor();
  await row.evaluate((node) => {
    for (const button of node.querySelectorAll('button')) if (button !== node.querySelector('button')) button.remove();
  });
  expect(await row.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false);
  await swipeRight(page, await inside(page, 'start-row', { x: 0.6, y: 0.5 }));
  await expect(shown(page, 'home'), 'a swipe from the start row that fits goes back').toBeVisible();
  const empty = async () => {
    const points = await emptyGraph(page);
    expect(points.length).toBeGreaterThan(0);
    return points[Math.floor(points.length / 2)];
  };
  await goesBack(page, editor, 'editor', empty, "the graph's empty space");
  const over = async () => ({ x: 8, y: (await inside(page, 'graph')).y });
  await goesBack(page, editor, 'editor', over, 'the left edge over the graph');

  // The cards of detail mode.
  const cards = async () => {
    await page.getByTestId('mode-detail').click();
    await expect(page.getByTestId('detail-panel')).toBeVisible();
    return inside(page, 'detail-panel', { x: 0.5, y: 0.6 });
  };
  await goesBack(page, editor, 'editor', cards, "the detail panel's cards");
  expect(errors).toEqual([]);
});

test('a drag that starts on a level line, a border or a chip moves the value and stays in the editor', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  const number = async (testid: string) => parseFloat((await page.getByTestId(testid).textContent())!);
  const stays = async () => {
    await page.waitForTimeout(400);
    await expect(shown(page, 'editor')).toBeVisible();
  };

  // A level line, dragged up and along.
  const pressure = await number('value-infusePressure');
  const line = await page.locator('line.level[data-field="infusePressure"]').evaluate((level) => {
    const rect = level.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await swipe(page, line, { x: line.x + 300, y: line.y - 80 }, 120);
  await stays();
  expect(await number('value-infusePressure')).toBeGreaterThan(pressure);
  // Straight up too: the graph's `pan-y` is no scroll where the finger lies on a line.
  const higher = await number('value-infusePressure');
  const moved = await page.locator('line.level[data-field="infusePressure"]').evaluate((level) => {
    const rect = level.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await swipe(page, moved, { x: moved.x, y: moved.y - 60 }, 120);
  await stays();
  expect(await number('value-infusePressure')).toBeGreaterThan(higher);

  // A border: the pressurize column's right edge, away from the lines, dragged to the right.
  const ramp = await number('value-rampTime');
  const graph = (await page.getByTestId('graph').boundingBox())!;
  const column = (await page.getByTestId('column-pressurize').boundingBox())!;
  const border = { x: column.x + column.width, y: graph.y + graph.height * 0.62 };
  await swipe(page, border, { x: border.x + 200, y: border.y }, 120);
  await stays();
  expect(await number('value-rampTime')).toBeGreaterThan(ramp);

  // The infuse-to chip, dragged to the right.
  const weight = await number('chip-value-graph-infuseWeight');
  const chip = (await page.getByTestId('chip-graph-infuseWeight').locator('.body').boundingBox())!;
  const from = { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 };
  await swipe(page, from, { x: from.x + 150, y: from.y }, 120);
  await stays();
  expect(await number('chip-value-graph-infuseWeight')).toBeGreaterThan(weight);
  expect(errors).toEqual([]);
});
