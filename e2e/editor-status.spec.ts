import { expect, test, type Page } from '@playwright/test';
import plugin12 from '../src/aflow/fixtures/plugin-1.2.json' with { type: 'json' };
import type { Profile } from '../src/api';
import { DEFAULT_SAVE_HINT } from '../src/editor/status';
import { mockGateway, record } from './mock-gateway';
import { back } from './touch';

// The A-Flow editor's status line and spacing: every notice stands
// in the one line under the start row and nowhere else, and the header with the name, the start
// row, save, save as and the mode switch is one row at 1280 x 800 with room between the buttons.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openEditor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
}

const box = async (page: Page, id: string) => (await page.getByTestId(id).boundingBox())!;

/** The text stands once on the editor's screen, in the status line under the start row, above the graph. */
async function inStatusLine(page: Page, text: string | RegExp) {
  await expect(page.getByTestId('editor-notice')).toHaveText(text);
  await expect(page.getByTestId('screen-editor').getByText(text)).toHaveCount(1);
  await expect(page.getByTestId('editor-status').getByText(text)).toHaveCount(1);
  const row = await box(page, 'start-row');
  const line = await box(page, 'editor-notice');
  const status = await box(page, 'editor-status');
  expect(line.y).toBeGreaterThanOrEqual(status.y);
  expect(line.y + line.height).toBeLessThanOrEqual(status.y + status.height + 0.5);
  expect(status.y).toBeGreaterThanOrEqual(row.y + row.height);
  expect(status.y + status.height).toBeLessThanOrEqual((await box(page, 'graph')).y);
}

const HEADER = ['editor-profile', 'start-row', 'save', 'save-as', 'mode-simple', 'mode-detail'];

async function headerOnOneRow(page: Page) {
  const boxes = await Promise.all(HEADER.map((id) => box(page, id)));
  for (const each of boxes) expect(Math.abs(each.y - boxes[0].y)).toBeLessThanOrEqual(1);
  // Left to right, none over another, all on the screen.
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
  expect(boxes.at(-1)!.x + boxes.at(-1)!.width).toBeLessThanOrEqual(1280);
}

test('the header is one row at 1280 x 800, in simple and in detail, with room between the buttons', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await headerOnOneRow(page);

  // The start row's buttons and save / save as stand apart, the groups further.
  const buttons = page.getByTestId('start-row').locator('button');
  await expect(buttons).toHaveCount(5);
  const starts = await Promise.all((await buttons.all()).map(async (button) => (await button.boundingBox())!));
  for (let i = 1; i < starts.length; i++) expect(starts[i].x - (starts[i - 1].x + starts[i - 1].width)).toBeGreaterThanOrEqual(10);
  const save = await box(page, 'save');
  const saveAs = await box(page, 'save-as');
  expect(saveAs.x - (save.x + save.width)).toBeGreaterThanOrEqual(10);
  const simple = await box(page, 'mode-simple');
  expect(simple.x - (saveAs.x + saveAs.width)).toBeGreaterThanOrEqual(24);

  await page.getByTestId('save').click();
  await inStatusLine(page, DEFAULT_SAVE_HINT);
  await page.screenshot({ path: 'docs/product/editor-status.png' });

  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  await headerOnOneRow(page);
});

test("the save as hint, 'saved as' and a failed save stand in the status line", async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await openEditor(page);

  await page.getByTestId('save').click();
  await inStatusLine(page, DEFAULT_SAVE_HINT);

  await page.getByTestId('toggle-second-fill').click();
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('morning light');
  await page.getByTestId('save-confirm').click();
  await inStatusLine(page, 'Saved as “morning light” and loaded.');

  // 'save' on the saved profile.
  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('save').click();
  await inStatusLine(page, 'Saved “morning light” and loaded.');

  // The same steps under another name: Decaid keeps one profile for each set of steps.
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('evening');
  await page.getByTestId('save-confirm').click();
  await inStatusLine(page, /^The profile was not saved/);
});

test('without the gateway, its failure and a failed load on leaving stand in the status line', async ({ page }) => {
  await mockGateway(page, { gateway: false });
  await openEditor(page);
  await inStatusLine(page, /^Decaid did not answer/);

  await page.getByTestId('toggle-flow').click();
  await back(page);
  await inStatusLine(page, /^The changes were not loaded/);
  // The browser reports each refused request; those are the test's own doing.
  errors.splice(0, errors.length, ...errors.filter((error) => !error.includes('ERR_CONNECTION_REFUSED')));
});

test('an older A-Flow profile names what was dropped in the status line', async ({ page }) => {
  const old = { ...(plugin12.find((p) => p.title === 'A-Flow / default-very-dark') as Profile), title: 'A-Flow / my very dark' };
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:old', old, { source: 'user' }));
  gateway.workflow.profile = old;
  await openEditor(page);
  await inStatusLine(page, /^An older A-Flow profile, read without ramp down/);
});
