import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Every graph's content stands the same distance from its frame on all four sides, the
// legend's gap on home (`--graph-pad`, 0.6 rem): the left edge of the tick numbers, the top of the
// topmost tick, the right end of the grid or of the last time label, the foot of the time
// labels or of the legend. The card editor's frames have the same gap at all four sides.

const BASE = blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile;

interface Gaps {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What a list or a card shows: the elements with no element in them. */
const LEAVES = '*:not(:has(*))';

const GRAPH = 'svg text.tick, svg text.time, svg text.phase, svg text.duration, svg line.grid, svg rect.selected, .legend li';

/** The four gaps in CSS pixels between a frame's padding edge and the box around the content `selector` finds in it. */
async function gaps(frame: Locator, selector: string): Promise<Gaps> {
  return frame.evaluate((element, find) => {
    const inner = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const edge = { left: inner.left + parseFloat(style.borderLeftWidth), top: inner.top + parseFloat(style.borderTopWidth) };
    const far = {
      right: inner.right - parseFloat(style.borderRightWidth),
      bottom: inner.bottom - parseFloat(style.borderBottomWidth),
    };
    // A list that scrolls: its foot is read at the end of it, its other sides at the start.
    const scrolls = element.scrollHeight > element.clientHeight;
    const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const read = (parts: Iterable<Element>, sides: (keyof typeof box)[]) => {
      for (const part of parts) {
        const rect = part.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        for (const side of sides)
          box[side] = side === 'left' || side === 'top' ? Math.min(box[side], rect[side]) : Math.max(box[side], rect[side]);
      }
    };
    if (scrolls) {
      element.scrollTop = 0;
      read(element.querySelectorAll(find), ['left', 'top', 'right']);
      element.scrollTop = element.scrollHeight;
      read(element.querySelectorAll(find), ['bottom']);
    } else {
      read(element.querySelectorAll(find), ['left', 'top', 'right', 'bottom']);
    }
    return { left: box.left - edge.left, top: box.top - edge.top, right: far.right - box.right, bottom: far.bottom - box.bottom };
  }, selector);
}

const pad = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.6);

function expectEven(got: Gaps, want: number) {
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(got[side] - want), `${side} gap ${got[side]} against ${want}`).toBeLessThanOrEqual(1);
  }
}

/** A list's lines do not all fill its width: the left, the top and the foot are its gap, the right at least as wide. */
function expectList(got: Gaps, want: number) {
  for (const side of ['left', 'top', 'bottom'] as const) {
    expect(Math.abs(got[side] - want), `${side} gap ${got[side]} against ${want}`).toBeLessThanOrEqual(1);
  }
  expect(got.right).toBeGreaterThanOrEqual(want - 1);
}

async function editor(page: Page) {
  const gateway = await mockGateway(page);
  gateway.profiles.push({
    id: 'profile:mine',
    profile: structuredClone(BASE),
    metadataHash: 'm',
    compoundHash: 'c',
    parentId: null,
    visibility: 'visible',
    isDefault: false,
    createdAt: '2026-10-16T04:00:00Z',
    updatedAt: '2026-10-16T04:00:00Z',
    metadata: null,
  });
  gateway.workflow.profile = structuredClone(BASE);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
}

for (const legend of [true, false]) {
  test(`home's graph stands one gap from its frame on all four sides, legend ${legend ? 'on' : 'off'}`, async ({ page }) => {
    await mockGateway(page);
    await page.addInitScript((on) => localStorage.setItem('pureflow.settings', JSON.stringify({ showGraphLegend: on })), legend);
    await page.goto('/');
    await expect(page.getByTestId('screen-home')).toBeVisible();
    const frame = page.locator('[data-testid="home-shot"] [data-main-frame]');
    await expect(frame.getByTestId('shot-graph')).toBeVisible();
    if (legend) await expect(frame.getByTestId('shot-legend')).toBeVisible();
    const got = await gaps(frame, GRAPH);
    console.log('home', legend, JSON.stringify(got));
    expectEven(got, await pad(page));
    await page.screenshot({ path: `${process.env.SHOTS ?? 'e2e/.results'}/home-${legend ? 'legend' : 'plain'}.png` });
  });
}

test("steam's graph stands one gap from its frame on all four sides", async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  const frame = page.locator('[data-testid="screen-steam"] [data-main-frame]:has([data-testid="shot-graph"])');
  await expect(frame.getByTestId('shot-graph')).toBeVisible();
  const got = await gaps(frame, GRAPH);
  console.log('steam', JSON.stringify(got));
  expectEven(got, await pad(page));
  await page.screenshot({ path: `${process.env.SHOTS ?? 'e2e/.results'}/steam.png` });
});

/** Whether every box of `inner` lies inside the one rect `outer` finds, in CSS pixels. */
async function holds(scope: Locator, outer: string, inner: string): Promise<boolean> {
  return scope.evaluate(
    (root, [outside, inside]) => {
      const box = root.querySelector(outside)!.getBoundingClientRect();
      const labels = [...root.querySelectorAll(inside)];
      return (
        labels.length > 0 &&
        labels.every((label) => {
          const rect = label.getBoundingClientRect();
          return rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5;
        })
      );
    },
    [outer, inner],
  );
}

for (const mode of ['simple', 'detail'] as const) {
  test(`the flow editor's graph stands one gap from its frame in ${mode} mode`, async ({ page }) => {
    await mockGateway(page).then((gateway) => gateway.withDefaults('light'));
    await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
    await page.goto('/');
    await expect(page.getByTestId('graph')).toBeVisible();
    if (mode === 'detail') await page.getByTestId('mode-detail').click();
    const frame = page.getByTestId('graph').locator('xpath=../..');
    const content = 'svg text.tick, svg text.phase, svg text.duration, svg line.grid, svg rect.column.selected';
    await expect.poll(async () => (await gaps(frame, content)).top).toBeCloseTo(await pad(page), 0);
    const got = await gaps(frame, content);
    console.log('flow', mode, JSON.stringify(got));
    expectEven(got, await pad(page));
    if (mode === 'detail') expect(await holds(frame, 'rect.column.selected', 'text.phase, text.duration')).toBe(true);
  });
}

test("the cards tab: the graph's selected step holds the time labels, the frames stand one gap from their content", async ({
  page,
}) => {
  await editor(page);
  const unit = await pad(page);
  const preview = page.getByTestId('step-preview');
  await expect(preview.getByTestId('step-selected')).toBeVisible();
  expectEven(await gaps(preview, GRAPH), unit);
  expect(await holds(preview, 'rect.selected', 'text.time')).toBe(true);
  await page.screenshot({ path: `${process.env.SHOTS ?? 'e2e/.results'}/cards.png` });
  expectEven(await gaps(page.getByTestId('step-card-0'), LEAVES), unit);
  // A closed card is as high as the open one and its lines start at the top left: those two sides are its gap.
  const closed = await gaps(page.getByTestId('step-card-1'), LEAVES);
  expect(Math.abs(closed.left - unit)).toBeLessThanOrEqual(1);
  expect(Math.abs(closed.top - unit)).toBeLessThanOrEqual(1);
  await page.getByTestId('tab-script').click();
  expectList(await gaps(page.getByTestId('script-steps'), LEAVES), unit);
  expectEven(await gaps(page.getByTestId('step-script').getByTestId('step-preview'), GRAPH), unit);
});
