import { readFileSync } from 'node:fs';
import type { MachineSnapshot } from '../src/api';
import type { Settings } from '../src/settings';
import type { Backup } from '../src/settings-backup';
import { expect, test } from '@playwright/test';
import { IDLE } from './idle';

// The backup of the settings in Decaid's KV store against the rig: a
// changed setting can be read back from the running gateway's KV store, and a start without
// settings in localStorage takes it back from there. The test deletes the key it creates (or
// puts back the one it found); the setting it changes lives in the test browser's own
// localStorage, which ends with the test. Without a gateway: e2e/settings-backup.spec.ts.

/** the skin's version, which the backup names */
const VERSION = (JSON.parse(readFileSync('public/manifest.json', 'utf8')) as { version: string }).version;
const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/pureflow/settings-backup';

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('a changed setting is backed up in the KV store and comes back after localStorage is cleared', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  // A missing key answers 200 null.
  const before = await api('GET', BACKUP);
  try {
    await api('DELETE', BACKUP);
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await page.getByTestId('menu').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-category-skin').click();
    const legend = page.getByTestId('setting-show-graph-legend');
    await expect(legend).toHaveAttribute('aria-checked', 'true');
    await legend.click();

    await expect
      .poll(async () => (await api<Backup | null>('GET', BACKUP))?.settings?.showGraphLegend, { timeout: 10_000 })
      .toBe(false);
    const stored = await api<Backup>('GET', BACKUP);
    expect(stored.version).toBe(VERSION);
    expect(Date.now() - Date.parse(stored.savedAt)).toBeLessThan(60_000);
    await expect(page.getByTestId('backup-time')).toContainText('in Decaid, 20');

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('settings-restored')).toBeVisible({ timeout: 15_000 });
    // localStorage held the screen too: the skin starts on home
    await page.getByTestId('menu').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-category-skin').click();
    await expect(page.getByTestId('setting-show-graph-legend')).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('pureflow.settings')!) as Settings).showGraphLegend)).toBe(
      false,
    );
  } finally {
    if (before === null || before === undefined) await api('DELETE', BACKUP);
    else await api('POST', BACKUP, before);
  }
  expect(await api('GET', BACKUP)).toEqual(before ?? null);
});
