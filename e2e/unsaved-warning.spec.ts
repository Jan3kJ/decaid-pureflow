import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PROFILES } from '../src/aflow';
import { buildProfile } from '../src/editor/save';
import { workflowProfile } from '../src/editor/storage';
import { defaultProfile } from '../src/shell/profiles';
import { mockGateway, type MockGateway } from './mock-gateway';

// The warning before a load while the machine holds unsaved edits from the editor (founder,
// 2026-10-14): leaving the editor with a change loads it unsaved; the next load of the skin
// asks first and loads nothing before the answer.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const light = DEFAULT_PROFILES.find((entry) => entry.id === 'default-light')!;
const puts = (gateway: MockGateway) => gateway.calls('PUT', '/api/v1/workflow');
const dialog = (page: Page) => page.getByTestId('unsaved-dialog');

/** The editor on 'light', one value changed, left by the profile's name: the picker, with the change on the machine. */
async function leaveWithChange(page: Page): Promise<MockGateway> {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('editor-profile').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(puts(gateway)).toHaveLength(1);
  return gateway;
}

const pickFloral = (page: Page) =>
  page.getByTestId('profile-item').filter({ hasText: 'A-Flow / default-floral' }).click();

test('a tap in the picker asks first; Cancel loads nothing', async ({ page }) => {
  const gateway = await leaveWithChange(page);
  await pickFloral(page);

  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('light has unsaved changes on the machine');
  await expect(page.getByTestId('unsaved-save-as')).toHaveText('Save as…');
  await expect(page.getByTestId('unsaved-discard')).toHaveText('Discard and load');
  await expect(page.getByTestId('unsaved-cancel')).toHaveText('Cancel');
  await page.screenshot({ path: 'docs/product/unsaved-warning.png' });
  // Nothing is loaded before the answer.
  expect(puts(gateway)).toHaveLength(1);

  await page.getByTestId('unsaved-cancel').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(puts(gateway)).toHaveLength(1);
  expect(gateway.workflow.profile.title).toBe(light.title);
  expect(errors).toEqual([]);
});

test('Discard and load loads the profile tapped', async ({ page }) => {
  const gateway = await leaveWithChange(page);
  await pickFloral(page);
  await page.getByTestId('unsaved-discard').click();

  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => puts(gateway).length).toBe(2);
  expect(puts(gateway)[1].body.profile.title).toBe('A-Flow / default-floral');
  // The picker was opened from the editor: it goes back there, on the loaded profile.
  await expect(page.getByTestId('editor-profile')).toHaveText('floral');
  expect(errors).toEqual([]);
});

test('Save as… opens the editor\'s save as on the values on the machine', async ({ page }) => {
  const gateway = await leaveWithChange(page);
  await pickFloral(page);
  await page.getByTestId('unsaved-save-as').click();

  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);
  expect(puts(gateway)).toHaveLength(1);

  await page.getByTestId('save-name').fill('kept');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved as “kept” and loaded.');
  const posted = gateway.calls('POST', '/api/v1/profiles');
  expect(posted).toHaveLength(1);
  expect(posted[0].body.profile.title).toBe('A-Flow / kept');
  expect(posted[0].body.profile).toEqual(
    buildProfile({ ...light.params, flowUp: false }, { title: 'A-Flow / kept', author: posted[0].body.profile.author }, false),
  );
  expect(errors).toEqual([]);
});

test('without unsaved edits a tap loads at once', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'profiles'));
  await page.goto('/');
  await pickFloral(page);

  await expect.poll(() => puts(gateway).length).toBe(1);
  expect(puts(gateway)[0].body.profile.title).toBe('A-Flow / default-floral');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(errors).toEqual([]);
});

/** Unsaved edits of 'light' on the machine, as leaving the editor loads them, and the page on `screen`. */
async function withUnsaved(page: Page, screen: string): Promise<MockGateway> {
  const gateway = (await mockGateway(page)).withDefaults();
  const edited = { ...light.params, flowUp: false };
  gateway.workflow.profile = workflowProfile(buildProfile(edited, { title: light.title }, false), edited);
  gateway.addShot(
    'shot-1',
    '2026-10-14T07:00:00',
    workflowProfile(defaultProfile(DEFAULT_PROFILES[0]), DEFAULT_PROFILES[0].params),
    null,
  );
  await page.addInitScript((value) => localStorage.setItem('decaid-skin.screen', value), screen);
  await page.goto('/');
  return gateway;
}

test('another profile of the editor\'s start row asks too', async ({ page }) => {
  const gateway = await withUnsaved(page, 'editor');

  // The editor opens on the unsaved edits again.
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);
  await page.getByTestId('start-floral').click();
  await expect(dialog(page)).toBeVisible();
  await page.getByTestId('unsaved-cancel').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);

  await page.getByTestId('start-floral').click();
  await page.getByTestId('unsaved-save-as').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await page.getByTestId('save-cancel').click();

  await page.getByTestId('start-floral').click();
  await page.getByTestId('unsaved-discard').click();
  await expect(page.getByTestId('editor-profile')).toHaveText('floral');
  // The row only opens a profile in the editor; leaving loads it.
  expect(puts(gateway)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a restore from the shot history asks too', async ({ page }) => {
  const gateway = await withUnsaved(page, 'home');

  await page.getByTestId('nav-history').click();
  await page.getByTestId('history-entry').first().click();
  await expect(dialog(page)).toBeVisible();
  await page.getByTestId('unsaved-cancel').click();
  await expect(dialog(page)).toHaveCount(0);
  expect(puts(gateway)).toHaveLength(0);

  await page.getByTestId('nav-history').click();
  await page.getByTestId('history-entry').first().click();
  await page.getByTestId('unsaved-discard').click();
  await expect.poll(() => puts(gateway).length).toBe(1);
  expect(puts(gateway)[0].body.profile.title).toBe(DEFAULT_PROFILES[0].title);
  expect(errors).toEqual([]);
});
