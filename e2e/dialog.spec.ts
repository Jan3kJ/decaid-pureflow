import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway, profile, record, type MockGateway } from './mock-gateway';
import { back, selectPhase, swipe } from './touch';

// Every modal is the one Dialog, against a mocked gateway: Escape closes each of the ten, and
// only the one on top (the number pad over the pick); a tap on the scrim cancels too; a field in a
// dialog is still lifted above the keyboard.

const errors: string[] = [];

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Escape closes the dialog; it was a modal with a name. */
async function escapes(page: Page, testid: string) {
  const dialog = page.getByTestId(testid);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect((await dialog.getAttribute('aria-label')) ?? (await dialog.getAttribute('aria-labelledby'))).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

async function menuTo(page: Page, screen: string) {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId(`open-${screen}`).click();
}

test('the save as dialog, the number pad and the pick close with Escape; over the pick the pad closes first', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  const at = '2026-10-20T10:00:00.000';
  gateway.grinders = [
    { id: 'g1', model: 'Niche Zero', archived: false, settingType: 'numeric', settingSmallStep: 0.5, createdAt: at, updatedAt: at },
  ];
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();

  await page.getByTestId('save-as').click();
  await escapes(page, 'save-dialog');

  await page.getByTestId('mode-detail').click();
  await selectPhase(page, 'infuse');
  await page.getByTestId('chip-edit-infuseTime').click();
  await escapes(page, 'numpad');

  await back(page);
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick-grinder')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pick-setting').click();
  await escapes(page, 'numpad');
  await expect(page.getByTestId('pick')).toBeVisible();
  // A tap on the scrim beside the frame cancels as Escape does.
  await page.getByTestId('pick-setting').click();
  await page.getByTestId('numpad-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('numpad')).toHaveCount(0);
  await escapes(page, 'pick');
});

test('the camera, the date picker and the archive question close with Escape', async ({ page }) => {
  const gateway = await mockGateway(page);
  const at = '2026-10-20T10:00:00.000';
  gateway.beans = [
    { id: 'b1', name: 'Red Brick', roaster: 'Square Mile', decaf: false, archived: false, createdAt: at, updatedAt: at },
  ];
  await menuTo(page, 'beans');
  await expect(page.getByTestId('screen-beans')).toBeVisible();

  await page.getByTestId('bean-photo-take').click();
  await escapes(page, 'camera');

  await page.getByTestId('bean-roast-date').click();
  await escapes(page, 'datepicker');

  await page.getByTestId('bean-row').first().click();
  await page.getByTestId('bean-archive').click();
  await escapes(page, 'settings-confirm');
  expect(gateway.beans[0].archived).toBe(false);
});

test("the settings' restore and slot dialogs close with Escape", async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  gateway.store['pureflow/settings-backup'] = { savedAt: '2026-10-15T06:00:00.000Z', version: '0.0.1', settings: {} };
  await menuTo(page, 'settings');
  await page.getByTestId('settings-category-skin').click();

  await page.getByTestId('backup-restore').click();
  await escapes(page, 'backup-confirm');

  await page.getByTestId('start-slot-2').click();
  await escapes(page, 'start-choices');
});

test('the unsaved edits warning and the delete question of a step close with Escape', async ({ page }) => {
  const gateway: MockGateway = (await mockGateway(page)).withDefaults('light');
  gateway.profiles.push(record('profile:mine', profile('Mine', 36, 3), null));
  const bloom = { ...structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile), title: 'My blooming' };
  gateway.profiles.push(record('profile:bloom', bloom, null));
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('editor-profile')).toHaveText('light');
  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('editor-profile').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();

  const item = page.getByTestId('profile-item').filter({ hasText: 'My blooming' });
  await item.click();
  await page.getByTestId('edit-profile').click();
  await escapes(page, 'unsaved-dialog');
  await expect(page.getByTestId('screen-profiles')).toBeVisible();

  await page.getByTestId('edit-profile').click();
  await page.getByTestId('unsaved-discard').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await page.getByTestId('step-delete-0').click();
  await escapes(page, 'delete-dialog');
  await expect(page.getByTestId('step-count')).toHaveText(`${bloom.steps.length} steps`);
});

test("a field in a dialog stays above the keyboard: the picker's rename", async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const item = page.getByTestId('profile-item').filter({ hasText: 'D-Flow / default' });
  await expect(item).toHaveCount(1);
  const box = (await item.boundingBox())!;
  const from = { x: box.x + box.width - 60, y: box.y + box.height / 2 };
  await swipe(page, from, { x: from.x - 200, y: from.y + 4 });
  await page.getByTestId('profile-rename').click();
  const dialog = page.getByTestId('settings-confirm');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('settings-confirm-field')).toBeFocused();

  // The page shrinks as Decaid's WebView does under the keyboard: the dialog ends above it.
  const keyboard = 300;
  await page.setViewportSize({ width: 1280, height: keyboard });
  await expect.poll(async () => (await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height).toBeLessThanOrEqual(keyboard);
  expect((await dialog.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId('settings-confirm-field')).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 800 });
  await escapes(page, 'settings-confirm');
  await expect(page.locator('[data-lifted]')).toHaveCount(0);
});
