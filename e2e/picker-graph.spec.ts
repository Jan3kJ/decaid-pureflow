import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile, ProfileStep } from '../src/api';
import { pickerEntries, previewLastStepSeconds } from '../src/shell/profiles';
import { stepCurve } from '../src/steps/curve';
import { mockGateway, profile, record } from './mock-gateway';

// The picker's preview (spec 3.10 'Profile picker: graphs', acceptance 59), against a mocked
// gateway: a 0 s step adds no width; default-dark's pour starts at 2 ml/s and ends at 1 ml/s,
// where the A-Flow editor's line ends; its Pouring step's 9 bar pressure limit is a dotted
// pressure line across that step; a step without a limit draws none.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The points of a path's `d`, in pixels. */
async function points(path: Locator): Promise<{ x: number; y: number }[]> {
  const d = (await path.getAttribute('d')) ?? '';
  return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

async function select(page: Page, title: string) {
  await page.getByTestId('profile-item').filter({ hasText: title }).first().click();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText(title);
}

const flowStep = (over: Partial<ProfileStep>): ProfileStep => ({
  name: 'step',
  pump: 'flow',
  transition: 'fast',
  exit: null,
  volume: 0,
  seconds: 10,
  weight: 0,
  temperature: 93,
  sensor: 'coffee',
  flow: 2,
  limiter: null,
  ...over,
});

const LIMITED: Profile = {
  ...profile('Limited flow', 36),
  steps: [
    flowStep({ name: 'fill', flow: 6, seconds: 8 }),
    flowStep({ name: 'off', seconds: 0, flow: 9, limiter: { value: 3, range: 0.6 } }),
    flowStep({ name: 'pour', flow: 2.5, seconds: 30, limiter: { value: 9, range: 0.6 } }),
  ],
};

test("default-dark's pour starts at Ramp Up's exit and ends where the A-Flow editor's line does; its 9 bar limit is drawn", async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await select(page, 'A-Flow / default-dark');

  const dark = pickerEntries([]).find((entry) => entry.id === 'default-dark')!;
  const curve = stepCurve(dark.profile, { lastStepSeconds: previewLastStepSeconds(dark) });
  const preview = page.getByTestId('profile-preview');
  await expect(preview.getByTestId('step-preview')).toHaveAttribute('data-seconds', String(curve.seconds));
  await expect(preview.getByTestId('shot-border')).toHaveCount(curve.steps.length - 1);
  await expect(preview.getByTestId('shot-limit-pressure')).toHaveCount(1);

  // The pour and the limit over it: 2 ml/s, 1 ml/s and 9 bar on one linear scale.
  const pour = (await points(preview.getByTestId('shot-target-flow'))).slice(-2);
  const limit = (await points(preview.getByTestId('shot-limit-pressure'))).slice(-2);
  const perUnit = (pour[0].y - limit[0].y) / (9 - 2);
  expect(perUnit).toBeGreaterThan(0);
  expect(pour[1].y).toBeCloseTo(pour[0].y + perUnit, 0);
  expect(limit[0].x).toBeCloseTo(pour[0].x, 0);
  expect(limit[1].x).toBeCloseTo(pour[1].x, 0);
  expect(limit[1].y).toBeCloseTo(limit[0].y, 1);
  await page.screenshot({ path: 'docs/product/profile-picker-graph.png' });
  expect(errors).toEqual([]);
});

test('a 0 s step adds no width, a flow step shows its pressure limit, a profile without limits draws none', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:limited', structuredClone(LIMITED), null));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const preview = page.getByTestId('profile-preview');

  await select(page, 'Limited flow');
  await expect(preview.getByTestId('step-preview')).toHaveAttribute('data-seconds', '38');
  await expect(preview.getByTestId('shot-border')).toHaveCount(1);
  // Only the pour's limit: the 0 s step's limit is not drawn.
  await expect(preview.getByTestId('shot-limit-flow')).toHaveCount(0);
  const limit = await points(preview.getByTestId('shot-limit-pressure'));
  expect(limit).toHaveLength(2);
  const flow = await points(preview.getByTestId('shot-target-flow'));
  expect(limit[0].x).toBeCloseTo(flow[2].x, 0);
  expect(limit[1].x).toBeCloseTo(flow[3].x, 0);
  await page.screenshot({ path: 'docs/product/profile-picker-limit.png' });

  await select(page, 'Adaptive v2');
  await expect(preview.getByTestId('shot-target-pressure')).toHaveCount(1);
  await expect(preview.getByTestId('shot-limit-pressure')).toHaveCount(0);
  await expect(preview.getByTestId('shot-limit-flow')).toHaveCount(0);
  expect(errors).toEqual([]);
});
