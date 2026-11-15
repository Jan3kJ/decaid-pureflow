import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import bundled from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway, record } from './mock-gateway';
import { toPage } from './touch';

// The graphs that show a profile as designed (the picker's preview, the step editor's preview on the cards and
// script tabs, the flow editor's graph) draw no glow elements; home and steam, which show a measured shot, keep
// theirs. The curves' widths are pinned by graph-thin.spec.ts.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const ESPRESSO_80S = (bundled as unknown as Profile[]).find((entry) => entry.title === "80's Espresso")!;

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
}

test("the picker's preview has no glow", async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:mine', structuredClone({ ...ESPRESSO_80S, title: 'My 80s' }), null));
  await open(page);

  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').filter({ hasText: 'My 80s' }).first().click();
  const picker = page.getByTestId('profile-preview');
  await expect(picker.getByTestId('shot-graph')).toBeVisible();
  await expect(picker.locator('path.line').first()).toBeAttached();
  await expect(picker.locator('.glow')).toHaveCount(0);
});

test('both previews of the step editor have no glow', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = structuredClone({ ...ESPRESSO_80S, title: 'My 80s' });
  await open(page);
  await page.getByTestId('open-editor').click();
  const cards = page.getByTestId('step-preview');
  await expect(cards.getByTestId('shot-graph')).toBeVisible();
  await expect(cards.locator('path.line').first()).toBeAttached();
  await expect(cards.locator('.glow')).toHaveCount(0);

  await page.getByTestId('tab-script').click();
  const script = page.getByTestId('step-script').getByTestId('step-preview');
  await expect(script.locator('path.line').first()).toBeAttached();
  await expect(script.locator('.glow')).toHaveCount(0);
});

test("the flow editor's graph has no glow and keeps its three curves", async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  const graph = page.getByTestId('graph');
  await expect(graph).toBeVisible();
  await expect(graph.locator('.line:not(.limit)')).toHaveCount(3);
  await expect(graph.locator('.glow')).toHaveCount(0);
});

test('home after a shot and steam keep their glow', async ({ page }) => {
  const gateway = await mockGateway(page);
  await open(page);
  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('last-shot').locator('path.glow').first()).toBeAttached();
  expect(await page.getByTestId('last-shot').locator('.glow').count()).toBeGreaterThan(0);

  await toPage(page, 'steam');
  gateway.steamReplay(0);
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  expect(await page.getByTestId('screen-steam').locator('.glow').count()).toBeGreaterThan(0);
});
