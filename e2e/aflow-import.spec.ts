import { expect, test, type Page } from '@playwright/test';
import plugin12 from '../src/aflow/fixtures/plugin-1.2.json' with { type: 'json' };
import rig14 from '../src/aflow/fixtures/rig-plugin-1.4.json' with { type: 'json' };
import type { Profile } from '../src/api';
import { SKIN_METADATA } from '../src/editor/save';
import { readRecord } from '../src/editor/storage';
import { mockGateway, record, type MockGateway } from './mock-gateway';

// The import of old A-Flow profiles (spec 3.9 item 6, U7): the settings' button asks, naming
// what it found, converts each old profile as the editor's save does, skips Decaid's bundled
// ones and reports the counts.

const errors: string[] = [];
let gateway: MockGateway;

const plugin = (name: string) => (plugin12 as unknown as Profile[]).find((p) => p.title === `A-Flow / ${name}`)!;
const MINE: Profile = { ...plugin('default-very-dark'), title: 'A-Flow / my very dark' };
const BROKEN: Profile = {
  ...plugin('default-light'),
  title: 'A-Flow / changed',
  steps: plugin('default-light').steps.map((step, i) => (i === 1 ? { ...step, pump: 'flow' as const } : step)),
};
const BUNDLED = (rig14 as unknown as Profile[]).find((p) => p.title === 'A-Flow / default-very-dark')!;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
  gateway.profiles.push(
    record('profile:mine', MINE, { source: 'user' }),
    record('profile:changed', BROKEN, { source: 'user' }),
    record('profile:very-dark', BUNDLED, { source: 'bundled' }),
  );
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openSkinSettings(page: Page) {
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
}

const writes = () => gateway.requests.filter((request) => request.method !== 'GET' && request.path.startsWith('/api/v1/profiles'));

test('the button asks first; Cancel converts nothing', async ({ page }) => {
  await openSkinSettings(page);
  await page.getByTestId('aflow-import').click();

  const dialog = page.getByTestId('settings-confirm');
  await expect(dialog).toContainText('Convert old A-Flow profiles?');
  await expect(dialog).toContainText('1 old A-Flow profile is stored as A-Flow 3.0');
  await expect(dialog).toContainText("Skipped: 1 profile bundled with Decaid, for which the skin's defaults stand.");
  await expect(dialog).toContainText('Cannot be read: “A-Flow / changed” (a value of “Infuse” is missing).');
  await page.screenshot({ path: 'docs/product/aflow-import.png' });

  await page.getByTestId('settings-confirm-cancel').click();
  await expect(dialog).toHaveCount(0);
  expect(writes()).toEqual([]);
});

test('Convert stores the old profile as 3.0, its old version hidden, and shows the counts', async ({ page }) => {
  await openSkinSettings(page);
  await page.getByTestId('aflow-import').click();
  await page.getByTestId('settings-confirm-ok').click();

  await expect(page.getByTestId('aflow-import-result')).toHaveText(
    'Converted 1, skipped 1, could not read 1. Not read: “A-Flow / changed” (a value of “Infuse” is missing).',
  );
  const converted = gateway.profiles.find((stored) => stored.parentId === 'profile:mine')!;
  expect(converted.profile.title).toBe('A-Flow / my very dark');
  expect(converted.metadata).toMatchObject(SKIN_METADATA);
  expect(readRecord(converted)?.rampTime).toBe(6);
  const visibility = (id: string) => gateway.profiles.find((stored) => stored.id === id)!.visibility;
  expect(visibility('profile:mine')).toBe('hidden');
  expect(visibility('profile:very-dark')).toBe('visible');
  expect(visibility('profile:changed')).toBe('visible');

  // Again: nothing is left to convert, and it says so without asking.
  await page.getByTestId('aflow-import').click();
  await expect(page.getByTestId('settings-confirm')).toHaveCount(0);
  await expect(page.getByTestId('aflow-import-result')).toHaveText(
    "There is no old A-Flow profile to convert. Skipped: 1 profile bundled with Decaid, for which the skin's defaults stand. Cannot be read: “A-Flow / changed” (a value of “Infuse” is missing).",
  );
});
