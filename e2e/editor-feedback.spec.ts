import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import light from '../src/aflow/defaults/default-light.json' with { type: 'json' };

// The A-Flow editor's steps panel and save feedback: the
// stop weight stands in the flow step's exit, 'save' on a default hints at 'save as', and what a
// save answered stands in one line under the start row: a result goes after 4 s, a failure stays
// until the next action, and the graph does not move for either.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** `timed`: the page's clock is a fake one, so that `fastForward` runs the 4 s of a notice at once. */
async function openEditor(page: Page, timed = false) {
  if (timed) await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
}

const notice = (page: Page) => page.getByTestId('editor-notice');
const graphBox = async (page: Page) => (await page.getByTestId('graph').boundingBox())!;

test("the profile steps have no 'shot stops at' line; the flow step's exit holds the stop weight", async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await page.getByTestId('toggle-steps').click();
  await expect(page.getByTestId('steps')).toBeVisible();

  await expect(page.getByTestId('steps')).not.toContainText('The shot stops at');
  await expect(page.getByTestId('steps').locator('tfoot')).toHaveCount(0);
  const exits = page.getByTestId('step-exit');
  await expect(exits.last()).toContainText(`stops at ${light.stopWeight} g`);
  await expect(page.getByTestId('steps').locator('tbody tr').last()).toContainText('ml/s');
  await expect(exits.filter({ hasText: 'stops at' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("'save' on a default hints at 'save as' under the start row, and the hint goes after 4 s", async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await openEditor(page, true);
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  const before = await graphBox(page);

  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(notice(page)).toContainText('save as');
  // The line stands under the start row, above the graph, and the graph did not move.
  const row = (await page.getByTestId('start-row').boundingBox())!;
  const line = (await notice(page).boundingBox())!;
  expect(line.y).toBeGreaterThanOrEqual(row.y + row.height);
  expect(line.y + line.height).toBeLessThanOrEqual(before.y);
  expect(await graphBox(page)).toEqual(before);
  // A default is not saved over: nothing was stored or loaded.
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);

  await page.clock.fastForward(4_500);
  await expect(notice(page)).toHaveCount(0);
  expect(await graphBox(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('a save shows its result for 4 s; a failure stays until the next action', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await openEditor(page, true);
  const before = await graphBox(page);

  await page.getByTestId('toggle-second-fill').click();
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('morning light');
  await page.getByTestId('save-confirm').click();
  await expect(notice(page)).toHaveText('Saved as “morning light” and loaded.');
  expect(await graphBox(page)).toEqual(before);
  await page.screenshot({ path: 'docs/product/editor-save-feedback.png' });
  await page.clock.fastForward(4_500);
  await expect(notice(page)).toHaveCount(0);

  // The same values under another name: Decaid keeps one profile for each set of steps.
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('evening');
  await page.getByTestId('save-confirm').click();
  await expect(notice(page)).toContainText('The profile was not saved');
  expect(await graphBox(page)).toEqual(before);
  await page.clock.fastForward(5_000);
  await expect(notice(page)).toContainText('The profile was not saved');

  // The next action clears it: here a profile of the start row.
  await page.getByTestId('start-light').click();
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await expect(notice(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
