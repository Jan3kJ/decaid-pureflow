import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import { pickerEntries, previewLastStepSeconds } from '../src/shell/profiles';
import bundled from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { shotEstimate } from '../src/steps/estimate';
import { mockGateway, profile, record } from './mock-gateway';

// The estimate in the picker against a mocked
// gateway: the graph draws the modelled flow, pressure and temperature as its lines, the
// targets dotted under them, the step borders at the model's moments, and the caption says it
// is an estimate; a profile without steps draws nothing and no error; the step editor's curve
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
const CAPTION = 'estimate from the steps, a real shot differs with the coffee';

const d = async (path: Locator) => (await path.getAttribute('d')) ?? '';
/** The points of a path. */
const count = async (path: Locator) => (await d(path)).match(/[ML]/g)?.length ?? 0;

/** Whether the caption shows its whole text: nothing cut at its side or under it. */
const whole = (caption: Locator) =>
  caption.evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight);

/** Whether the caption's text, set on one line in its own font, is no wider than its box. */
const fitsOneLine = (caption: Locator) =>
  caption.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d')!;
    const css = getComputedStyle(element);
    context.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    return context.measureText(element.textContent ?? '').width <= element.clientWidth;
  });

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
  await expect(page.getByTestId('profile-caption')).toHaveText(CAPTION);
}

test('the picker draws the modelled shot with the targets dotted under it and says it is an estimate', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:80s', structuredClone(ESPRESSO_80S), null));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();

  await select(page, "80's Espresso");
  await expectEstimate(page, ESPRESSO_80S);
  // The caption is one line in the dim colour.
  const caption = page.getByTestId('profile-caption');
  const style = await caption.evaluate((element) => {
    const css = getComputedStyle(element);
    return { color: css.color, dim: getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() };
  });
  const dim = await page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, style.dim);
  expect(style.color).toBe(dim);
  // One line where the sentence fits on one with the font at hand, two where a wider font needs
  // them (the runner's fonts are not the tablet's): never cut.
  const fontSize = await caption.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const lines = (await fitsOneLine(caption)) ? 1 : 2;
  expect((await caption.boundingBox())!.height).toBeLessThan(fontSize * (lines + 1));
  expect(await whole(caption)).toBe(true);
  await page.screenshot({ path: 'docs/product/profile-picker-estimate.png' });

  // An A-Flow 3.0 default: its pour as the model ends it.
  const medium = pickerEntries([]).find((entry) => entry.id === 'default-medium')!;
  await select(page, 'A-Flow / default-medium');
  await expectEstimate(page, medium.profile, previewLastStepSeconds(medium));
  await page.screenshot({ path: 'docs/product/profile-picker-estimate-aflow.png' });
  expect(errors).toEqual([]);
});

test('the caption is never cut: with a wider font than the tablet has it takes a second line', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:80s', structuredClone(ESPRESSO_80S), null));
  // The skin's font stack (app.css) falls back to another font where system-ui is not there: here
  // the widest everywhere, monospace.
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = ':root { font-family: monospace; }';
      document.head.append(style);
    }),
  );
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await select(page, "80's Espresso");

  const caption = page.getByTestId('profile-caption');
  await expect(caption).toHaveText(CAPTION);
  expect(await fitsOneLine(caption)).toBe(false);
  expect(await whole(caption)).toBe(true);
  // The fixed area under the graph keeps its place for every profile: the caption's height is the same.
  const height = (await caption.boundingBox())!.height;
  await select(page, 'A-Flow / default-medium');
  expect((await caption.boundingBox())!.height).toBe(height);
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
  await expect(page.getByTestId('profile-caption')).toHaveText(CAPTION);
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
