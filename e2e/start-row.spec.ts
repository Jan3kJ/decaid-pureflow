import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';
import { back } from './touch';

// The editor's row of profiles to start from, chosen in the settings (founder, 2026-10-13):
// up to five A-Flow 3.0 profiles; 'save as' does not add to it.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = (await mockGateway(page)).withDefaults('light');
  // The skin opens on the editor the first time; a reload opens the screen it was on.
  await page.addInitScript(() => {
    if (!localStorage.getItem('pureflow.screen')) localStorage.setItem('pureflow.screen', 'editor');
  });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const row = (page: Page) => page.getByTestId('start-row').locator('button');
const slots = (page: Page) => page.getByTestId('settings-start').locator('.slot');

async function openSettings(page: Page) {
  await back(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
}

async function openEditor(page: Page) {
  await back(page);
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
}

test("'save as' does not change the row; a slot chosen in the settings does, and survives a reload", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await expect(row(page)).toHaveText(['floral', 'light', 'medium', 'dark', '46mm']);

  // 'save as' saves, opens and loads the profile, and leaves the row as it was.
  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('morning');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved as “morning” and loaded.');
  await expect(page.getByTestId('editor-profile')).toHaveText('morning');
  await expect(row(page)).toHaveText(['floral', 'light', 'medium', 'dark', '46mm']);
  await expect(page.locator('[data-testid="start-row"] [aria-pressed="true"]')).toHaveCount(0);

  // Slot 2 offers 'empty', its own profile and every A-Flow 3.0 profile no other slot holds.
  await openSettings(page);
  await expect(slots(page).locator('b')).toHaveText(['floral', 'light', 'medium', 'dark', '46mm']);
  await page.getByTestId('start-slot-2').click();
  await expect(page.getByTestId('start-choices')).toBeVisible();
  await expect(page.getByTestId('start-choice')).toHaveText(['light', 'morning']);
  await page.getByTestId('start-choice').filter({ hasText: 'morning' }).click();
  await expect(page.getByTestId('start-choices')).toHaveCount(0);
  await page.getByTestId('start-slot-5').click();
  await page.getByTestId('start-choice-empty').click();
  await expect(page.getByTestId('start-slot-2').locator('b')).toHaveText('morning');
  await expect(page.getByTestId('start-slot-5')).toContainText('empty');
  await expect(page.getByTestId('start-missing')).toHaveCount(0);
  // the backup of the changed slots is written (founder, 2026-10-14)
  await expect(page.getByTestId('backup-time')).toContainText('in Decaid');
  await page.screenshot({ path: 'docs/product/settings.png' });

  // The editor's row follows, in the slots' order.
  await openEditor(page);
  await expect(row(page)).toHaveText(['floral', 'morning', 'medium', 'dark']);
  await expect(page.getByTestId('start-morning')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(row(page)).toHaveText(['floral', 'morning', 'medium', 'dark']);

  // A tap on the row opens that profile in the editor.
  await page.getByTestId('start-floral').click();
  await expect(page.getByTestId('editor-profile')).toHaveText('floral');
  await expect(page.getByTestId('toggle-second-fill')).toHaveAttribute('aria-pressed', 'true');
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(1);
});

test('a chosen profile that no longer exists is left out of the row and shown as missing until it is removed', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('pureflow.settings')) {
      localStorage.setItem(
        'pureflow.settings',
        JSON.stringify({ startProfiles: ['A-Flow / gone', 'A-Flow / default-dark', null, null, null] }),
      );
    }
  });
  await page.goto('/');
  await expect(row(page)).toHaveText(['dark']);

  await openSettings(page);
  await expect(page.getByTestId('start-slot-1')).toContainText('gone');
  await expect(page.getByTestId('start-slot-1').getByTestId('start-missing')).toHaveText('missing');
  await expect(page.getByTestId('start-slot-3')).toContainText('empty');
  await page.getByTestId('start-slot-1').click();
  // The missing one is not offered: only what the editor can open.
  await expect(page.getByTestId('start-choice')).toHaveText(['floral', 'light', 'medium', '46mm']);
  await page.getByTestId('start-choice-empty').click();
  await expect(page.getByTestId('start-missing')).toHaveCount(0);
  await expect(page.getByTestId('start-slot-1')).toContainText('empty');

  await openEditor(page);
  await expect(row(page)).toHaveText(['dark']);
});
