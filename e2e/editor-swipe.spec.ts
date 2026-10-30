import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';
import { swipe } from './touch';

// The editor's swipe back to home: in the A-Flow editor and in
// the step editor a swipe from left to right leaves for home, the way back, loading
// changed values once and nothing without changes; a drag on the A-Flow graph is the graph's,
// and a swipe to the left stays.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

async function openEditor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('screen-editor')).toBeVisible();
}

/** The A-Flow editor's footer, between its toggles: off the graph and its chips. */
const FOOTER = { left: { x: 420, y: 755 }, right: { x: 1000, y: 755 } };
const number = async (page: Page, testid: string) => parseFloat((await page.getByTestId(testid).textContent())!);

test('A-Flow editor: a drag on the graph moves its line, a swipe to the left stays, a swipe to the right loads the change once and goes home', async ({
  page,
}) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await expect(page.getByTestId('graph')).toBeVisible();
  const before = await number(page, 'value-infusePressure');

  // A finger on the infuse pressure line, moving more along than across: the line's, not a swipe.
  const from = await page.locator('line.level[data-field="infusePressure"]').evaluate((line) => {
    const rect = line.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await swipe(page, from, { x: from.x + 400, y: from.y - 80 });
  await page.waitForTimeout(400);
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  const pressure = await number(page, 'value-infusePressure');
  expect(pressure).toBeGreaterThan(before);

  // To the left: the editor gives a little and stays.
  await swipe(page, FOOTER.right, FOOTER.left);
  await page.waitForTimeout(400);
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);

  // To the right: home, with the changed value loaded once.
  await swipe(page, FOOTER.left, FOOTER.right);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('screen-editor')).toHaveCount(0);
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);
  await expect(page.getByTestId('profile-name')).toHaveText('default-light');

  // Open again on the loaded value; a swipe without a change loads nothing more.
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('value-infusePressure')).toHaveText(`${pressure} bar`);
  await swipe(page, FOOTER.left, FOOTER.right);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('A-Flow editor: a swipe to the right without changes goes home and loads nothing', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await expect(page.getByTestId('graph')).toBeVisible();
  await swipe(page, FOOTER.left, FOOTER.right);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  expect(errors).toEqual([]);
});

const BLOOMING = blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile;
/** Over the step editor's preview, which only shows: off the cards. */
const PREVIEW = { left: { x: 300, y: 250 }, right: { x: 900, y: 250 } };

test('step editor: a swipe to the right loads the changed steps once and goes home, also with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const gateway = await mockGateway(page);
  gateway.workflow.profile = structuredClone(BLOOMING);
  await openEditor(page);
  await expect(page.getByTestId('step-cards')).toBeVisible();

  // Without a change: home, nothing loaded.
  await swipe(page, PREVIEW.left, PREVIEW.right);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);

  // A changed pump; a swipe to the left stays, one to the right loads it once.
  await page.getByTestId('open-editor').click();
  await page.getByTestId('cycle-0-pump').click();
  await expect(page.getByTestId('cycle-value-0-pump')).toHaveText('Flow slowly');
  await swipe(page, PREVIEW.right, PREVIEW.left);
  await page.waitForTimeout(400);
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await swipe(page, PREVIEW.left, PREVIEW.right);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  expect(puts[0].body.profile.steps[0].pump).toBe('flow');
  expect(errors).toEqual([]);
});
