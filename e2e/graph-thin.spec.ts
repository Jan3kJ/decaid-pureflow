import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import bundled from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway, record } from './mock-gateway';
import { toPage } from './touch';

// Every graph's curves and their glow are stroked at 0.7 times the old width (--curve-thin), at the default
// display size and scale 2: home, steam, the profile picker's preview, the step editor's preview and the
// flow editor.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const ESPRESSO_80S = (bundled as unknown as Profile[]).find((entry) => entry.title === "80's Espresso")!;

/** The old widths in px at the 16 px root of 1280 x 800: line, then the glow's four strokes. */
const OLD = { line: 0.2 * 16, outer: 1.2 * 16, wide: 0.8 * 16, mid: 0.5 * 16, inner: 0.3 * 16 };
const OLD_EDITOR = { line: 0.24 * 16, glow: 0.8 * 16 };

const width = (target: Locator) => target.first().evaluate((element) => parseFloat(getComputedStyle(element).strokeWidth));

async function expectShotGraph(graph: Locator, glow = true) {
  const line = await width(graph.getByTestId('shot-line-pressure'));
  expect(Math.abs(line - OLD.line * 0.7)).toBeLessThan(0.05);
  // At least 2 CSS px, so the line stays a line at the default display size.
  expect(line).toBeGreaterThanOrEqual(2);
  if (!glow) return;
  for (const name of ['outer', 'wide', 'mid', 'inner'] as const) {
    const stroke = await width(graph.locator(`.glow.${name}`));
    expect(Math.abs(stroke - OLD[name] * 0.7), name).toBeLessThan(0.05);
  }
}

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
}

test('home, steam and the picker stroke the curve and its glow at 0.7 times the old width', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:mine', structuredClone({ ...ESPRESSO_80S, title: 'My 80s' }), null));
  await open(page);

  await gateway.replay(page, 0, 1);
  await expectShotGraph(page.getByTestId('last-shot'));

  await toPage(page, 'steam');
  gateway.steamReplay(0);
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  await expectShotGraph(page.getByTestId('screen-steam'));

  await toPage(page, 'home');
  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').filter({ hasText: 'My 80s' }).first().click();
  await expectShotGraph(page.getByTestId('profile-preview'));
});

test("the step editor's preview strokes its curve and glow at 0.7 times the old width", async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = structuredClone({ ...ESPRESSO_80S, title: 'My 80s' });
  await open(page);
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-preview')).toBeVisible();
  await expectShotGraph(page.getByTestId('step-preview'));
});

test('the flow editor strokes its line and glow at 0.7 times the old width', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  const graph = page.getByTestId('graph');
  await expect(graph).toBeVisible();
  expect(Math.abs((await width(graph.getByTestId('line-flow'))) - OLD_EDITOR.line * 0.7)).toBeLessThan(0.05);
  expect(Math.abs((await width(graph.locator('.glow'))) - OLD_EDITOR.glow * 0.7)).toBeLessThan(0.05);
});
