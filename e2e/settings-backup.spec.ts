import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GATEWAY, mockGateway, type MockGateway } from './mock-gateway';

// The backup of the settings in Decaid's KV store (founder, 2026-10-14): every save writes it
// after a short pause, a start without settings takes it back, and the settings page restores
// it on request. The same against the running gateway: e2e-rig/settings-backup.spec.ts.

const KEY = 'pureflow/settings-backup';
/** the skin's version, which the backup names */
const VERSION: string = JSON.parse(readFileSync('public/manifest.json', 'utf8')).version;
const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    // The failed write of one test is a 500 the browser logs by itself.
    if (message.type() === 'error' && !message.text().includes('500 (Internal Server Error)')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openSettings(page: Page) {
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
}

const workaround = (page: Page) => page.getByTestId('setting-first-step-workaround');
const backup = () => gateway.store[KEY] as { savedAt: string; version: string; settings: any } | undefined;

test('a change is backed up; a start without settings takes them back and says so once', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await expect(page.getByTestId('backup-time')).toContainText('none yet');
  await workaround(page).click();
  await workaround(page).click();
  await workaround(page).click();

  // Three taps, one write, with the last value, after the pause.
  await expect.poll(() => backup()?.settings.firstStepWorkaround).toBe(true);
  const writes = gateway.requests.filter((request) => request.method === 'POST' && request.path.endsWith(KEY));
  expect(writes).toHaveLength(1);
  expect(backup()!.version).toBe(VERSION);
  expect(Date.now() - Date.parse(backup()!.savedAt)).toBeLessThan(60_000);
  await expect(page.getByTestId('backup-time')).toContainText('in Decaid, 20');
  await expect(page.getByTestId('backup-error')).toHaveCount(0);

  // A cleared app: localStorage is empty, the backup in Decaid is not.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('settings-restored')).toContainText('Settings restored from the backup in Decaid of 20');
  await openSettings(page);
  await expect(workaround(page)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings-restored-ok').click();
  await expect(page.getByTestId('settings-restored')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pureflow.settings')!).firstStepWorkaround)).toBe(true);

  // Said once: the next start has settings of its own.
  await page.reload();
  await expect(page.getByTestId('backup-time')).toContainText('in Decaid, 20');
  await expect(page.getByTestId('settings-restored')).toHaveCount(0);
});

test("'Restore from backup' asks first, and bad fields of the backup are the defaults", async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByTestId('backup-restore').click();
  await page.getByTestId('backup-confirm-restore').click();
  await expect(page.getByTestId('backup-restored')).toHaveText('There is no backup in Decaid.');

  gateway.store[KEY] = {
    savedAt: '2026-10-15T06:00:00.000Z',
    version: '0.0.1',
    settings: { showGraphLegend: false, steam: { mugSmall: 'heavy', mugLarge: 300 }, startProfiles: 'all' },
  };
  await page.getByTestId('backup-restore').click();
  await expect(page.getByTestId('backup-confirm')).toBeVisible();
  await page.getByTestId('backup-cancel').click();
  await expect(page.getByTestId('backup-confirm')).toHaveCount(0);
  await expect(page.getByTestId('setting-show-graph-legend')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('backup-restore').click();
  await page.getByTestId('backup-confirm-restore').click();
  await expect(page.getByTestId('backup-restored')).toContainText('Restored the backup of 2026-10-15');
  await expect(page.getByTestId('setting-show-graph-legend')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('setting-mug-small')).toContainText('150');
  await expect(page.getByTestId('setting-mug-large')).toContainText('300');
  await expect(page.getByTestId('settings-start').locator('b')).toHaveText(['floral', 'light', 'medium', 'dark', '46mm']);
  await expect(page.getByTestId('backup-time')).toContainText('in Decaid, 2026-10-15');
  // The restore is not written back: the backup stays as it was.
  await page.waitForTimeout(2000);
  expect(backup()!.version).toBe('0.0.1');
});

test('a failed write is shown on the settings page and the setting is saved all the same', async ({ page }) => {
  await page.route(`${GATEWAY}/api/v1/store/**`, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"store full"}' })
      : route.fallback(),
  );
  await page.goto('/');
  await openSettings(page);
  await workaround(page).click();
  await expect(page.getByTestId('backup-error')).toContainText('The backup in Decaid was not written');
  await expect(page.getByTestId('backup-error')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pureflow.settings')!).firstStepWorkaround)).toBe(true);
  expect(backup()).toBeUndefined();

  // The next write that works clears it.
  await page.unroute(`${GATEWAY}/api/v1/store/**`);
  await workaround(page).click();
  await expect(page.getByTestId('backup-error')).toHaveCount(0);
  await expect.poll(() => backup()?.settings.firstStepWorkaround).toBe(false);
});
