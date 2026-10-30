import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile, record, type MockGateway } from './mock-gateway';

// Edit beside load in the picker's detail panel: two buttons of half the
// width in the place of the one load button. Edit loads the selected profile as load does,
// asking about unsaved edits first, and opens its editor: the A-Flow editor on an A-Flow 3.0
// profile, the step editor on another. Load still goes back to where the picker was opened from.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const puts = (gateway: MockGateway) => gateway.calls('PUT', '/api/v1/workflow');

/** A gateway with a stored profile of steps, 'Mine', and the picker open from home. */
async function openPicker(page: Page): Promise<MockGateway> {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:mine', profile('Mine', 36, 3), null));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  return gateway;
}

const select = (page: Page, title: string) => page.getByTestId('profile-item').filter({ hasText: title }).first().click();

test('edit and load sit side by side, half the width each, the same height, in the place of the old button', async ({ page }) => {
  await openPicker(page);
  await select(page, 'Mine');
  const edit = (await page.getByTestId('edit-profile').boundingBox())!;
  const load = (await page.getByTestId('load-profile').boundingBox())!;
  const values = (await page.getByTestId('profile-detail').locator('dl').boundingBox())!;
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

  await expect(page.getByTestId('edit-profile')).toHaveText('edit');
  await expect(page.getByTestId('load-profile')).toHaveText('load');
  expect(Math.abs(edit.width - load.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(edit.height - load.height)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(edit.y - load.y)).toBeLessThanOrEqual(0.5);
  expect(edit.height).toBeGreaterThanOrEqual(3.4 * rem - 0.5);
  expect(Math.abs(load.x - (edit.x + edit.width) - 0.6 * rem)).toBeLessThanOrEqual(1);
  // Together they span the panel's width, as the one button did.
  expect(Math.abs(edit.x - values.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(load.x + load.width - (values.x + values.width))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'docs/product/picker-edit.png' });
  expect(errors).toEqual([]);
});

test('edit loads an A-Flow 3.0 default and opens the A-Flow editor on it', async ({ page }) => {
  const gateway = await openPicker(page);
  await select(page, 'A-Flow / default-floral');
  await page.getByTestId('edit-profile').click();

  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('step-cards')).toHaveCount(0);
  await expect(page.getByTestId('editor-profile')).toHaveText('floral');
  expect(puts(gateway)).toHaveLength(1);
  expect(puts(gateway)[0].body.profile.title).toBe('A-Flow / default-floral');
  expect(errors).toEqual([]);
});

test('edit loads a profile of steps and opens the step editor on it; load goes back home', async ({ page }) => {
  const gateway = await openPicker(page);
  await select(page, 'Mine');
  await page.getByTestId('edit-profile').click();

  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('Mine');
  expect(puts(gateway)).toHaveLength(1);
  expect(puts(gateway)[0].body.profile.title).toBe('Mine');

  // Load keeps its way: from home it loads and goes back home.
  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'home'));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await select(page, 'A-Flow / default-floral');
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(puts(gateway)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('edit asks about unsaved edits first: Cancel loads nothing, Discard and load opens the editor', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  gateway.profiles.push(record('profile:mine', profile('Mine', 36, 3), null));
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('editor-profile').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(puts(gateway)).toHaveLength(1);

  await select(page, 'Mine');
  await page.getByTestId('edit-profile').click();
  const dialog = page.getByTestId('unsaved-dialog');
  await expect(dialog).toContainText('light has unsaved changes on the machine');
  await page.getByTestId('unsaved-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(puts(gateway)).toHaveLength(1);

  await page.getByTestId('edit-profile').click();
  await page.getByTestId('unsaved-discard').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('Mine');
  expect(puts(gateway)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('both buttons are off while a load runs, and not there while nothing is selected', async ({ page }) => {
  const gateway = await openPicker(page);
  // A filter that hides every profile leaves nothing selected: there is nothing to edit or load.
  await page.getByTestId('profile-filter').fill('nothing of that name');
  await expect(page.getByTestId('profile-detail')).toContainText('Tap a profile to see it');
  await expect(page.getByTestId('edit-profile')).toHaveCount(0);
  await expect(page.getByTestId('load-profile')).toHaveCount(0);
  await page.getByTestId('profile-filter').fill('');

  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('http://localhost:8080/api/v1/workflow', async (route) => {
    if (route.request().method() === 'PUT') await held;
    await route.fallback();
  });
  await select(page, 'Mine');
  await page.getByTestId('edit-profile').click();
  await expect(page.getByTestId('edit-profile')).toBeDisabled();
  await expect(page.getByTestId('load-profile')).toBeDisabled();
  release();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  expect(puts(gateway)).toHaveLength(1);
  expect(errors).toEqual([]);
});
