import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import { pickerEntries, previewLastStepSeconds } from '../src/shell/profiles';
import bundled from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { shotEstimate } from '../src/steps/estimate';
import { mockGateway, profile, record } from './mock-gateway';

// The estimate in the picker against a mocked
// gateway: the graph draws the modelled flow, pressure and temperature as its lines, the
// targets dotted under them, the step borders at the model's moments, and the panel has no
// caption and no A-Flow line; a profile without steps draws nothing and no error; the step editor's curve
// keeps the targets as its lines and draws no model.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const ESPRESSO_80S = (bundled as unknown as Profile[]).find((entry) => entry.title === "80's Espresso")!;
const LINES = ['flow', 'pressure', 'temperature'] as const;

const d = async (path: Locator) => (await path.getAttribute('d')) ?? '';
/** The points of a path. */
const count = async (path: Locator) => (await d(path)).match(/[ML]/g)?.length ?? 0;

async function select(page: Page, title: string) {
  await page.getByTestId('profile-item').filter({ hasText: title }).first().click();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText(title);
}

/** The model's three lines and the targets under them, dotted, in the picker. */
async function expectEstimate(page: Page, body: Profile, lastStepSeconds?: number) {
  const estimate = shotEstimate(body, { lastStepSeconds });
  const preview = page.getByTestId('profile-preview');
  await expect(preview.getByTestId('step-preview')).toHaveAttribute('data-seconds', String(estimate.seconds));
  await expect(preview.getByTestId('shot-graph')).toHaveAttribute('data-points', String(estimate.t.length));
  for (const line of LINES) {
    expect(await count(preview.getByTestId(`shot-line-${line}`)), line).toBe(estimate[line].length);
  }
  for (const line of LINES) {
    const target = preview.getByTestId(`shot-target-${line}`);
    await expect(target, line).toHaveClass(/dotted/);
    expect(await count(target), line).toBeGreaterThan(0);
  }
  await expect(preview.getByTestId('shot-border')).toHaveCount(estimate.borders.length);
  await expect(page.getByTestId('profile-caption')).toHaveCount(0);
  await expect(page.getByTestId('profile-detail')).not.toContainText('A-Flow 3.0: once');
}

test('the picker draws the modelled shot with the targets dotted under it and no caption', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:80s', structuredClone(ESPRESSO_80S), null));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();

  await select(page, "80's Espresso");
  await expectEstimate(page, ESPRESSO_80S);
  await page.screenshot({ path: 'docs/product/profile-picker-estimate.png' });

  // An A-Flow 3.0 default: its pour as the model ends it.
  const medium = pickerEntries([]).find((entry) => entry.id === 'default-medium')!;
  await select(page, 'A-Flow / default-medium');
  await expectEstimate(page, medium.profile, previewLastStepSeconds(medium));
  await page.screenshot({ path: 'docs/product/profile-picker-estimate-aflow.png' });
  expect(errors).toEqual([]);
});

test('a profile without steps draws nothing and no error', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:empty', { ...profile('No steps', 36), steps: [] }, null));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await select(page, 'No steps');
  const preview = page.getByTestId('profile-preview');
  await expect(preview.getByTestId('shot-graph')).toHaveAttribute('data-points', '0');
  for (const line of LINES) expect(await d(preview.getByTestId(`shot-line-${line}`)), line).toBe('');
  await expect(preview.getByTestId('shot-border')).toHaveCount(0);
  await expect(page.getByTestId('profile-caption')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the step editor's curve keeps the targets as its lines and draws no model", async ({ page }) => {
  const gateway = await mockGateway(page);
  const mine = { ...structuredClone(ESPRESSO_80S), title: 'My 80s' };
  gateway.profiles.push(record('profile:mine', structuredClone(mine), null));
  gateway.workflow.profile = structuredClone(mine);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  const preview = page.getByTestId('step-preview');
  await expect(preview).toBeVisible();
  // 2 + 6 + 4 + 50 s of targets, whole.
  await expect(preview).toHaveAttribute('data-seconds', '62');
  for (const line of LINES) expect(await d(preview.getByTestId(`shot-line-${line}`)), line).toBe('');
  for (const line of ['flow', 'pressure'] as const) {
    const target = preview.getByTestId(`shot-target-${line}`);
    await expect(target).toHaveClass(/solid/);
    await expect(target).not.toHaveClass(/dotted/);
  }
  expect(errors).toEqual([]);
});
