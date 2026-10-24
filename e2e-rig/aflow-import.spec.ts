import { expect, test } from '@playwright/test';
import plugin12 from '../src/aflow/fixtures/plugin-1.2.json' with { type: 'json' };
import type { MachineSnapshot, Profile, ProfileRecord } from '../src/api';
import { importReport, planImport } from '../src/editor/import';
import { SKIN_METADATA } from '../src/editor/save';
import { readRecord } from '../src/editor/storage';

// The import of old A-Flow profiles (spec 3.9 item 6, U7) against the rig: the test stores one
// old A-Flow profile of its own (the plugin's 1.2 very-dark, under its own title and stop
// weight), checks first that it is the only profile the import would convert, so none of the
// rig's own profiles is touched, presses the settings' button and Convert, and checks the 3.0
// profile Decaid then holds. It purges both records afterwards and checks that the rig holds
// the profiles and the backup it held before.

const GATEWAY = 'http://localhost:8080';
const TITLE = 'A-Flow / pureflow rig import';
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

/** Every stored profile: the visible, the hidden and the soft-deleted ones. */
async function profileIds(): Promise<string[]> {
  const lists = await Promise.all([
    api<ProfileRecord[]>('GET', '/api/v1/profiles?includeHidden=true'),
    api<ProfileRecord[]>('GET', '/api/v1/profiles?visibility=deleted'),
  ]);
  return [...new Set(lists.flat().map((record) => record.id))].sort();
}

const OLD: Profile = {
  ...(plugin12 as unknown as Profile[]).find((p) => p.title === 'A-Flow / default-very-dark')!,
  title: TITLE,
  target_weight: 37.5,
};

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test("the settings' button converts the test's old A-Flow profile to 3.0, the rig's own are skipped", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const profilesBefore = await profileIds();
  const backupBefore = await api('GET', BACKUP);
  const visibleBefore = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).map((record) => record.id).sort();

  try {
    const old = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: OLD });
    expect(profilesBefore).not.toContain(old.id);

    // Only the test's own profile would be converted; otherwise nothing is pressed.
    const plan = planImport(await api<ProfileRecord[]>('GET', '/api/v1/profiles'));
    console.log(
      `rig import plan: convert ${plan.convert.map((entry) => entry.record.profile.title).join(', ')}; ` +
        `skip ${plan.skipped.map((record) => record.profile.title).join(', ')}; unread ${plan.unread.length}`,
    );
    expect(plan.convert.map((entry) => entry.record.id)).toEqual([old.id]);
    expect(plan.skipped.length).toBeGreaterThanOrEqual(5);

    await page.goto('/');
    await page.getByTestId('menu').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-category-skin').click();
    await page.getByTestId('aflow-import').click();
    await expect(page.getByTestId('settings-confirm')).toContainText('1 old A-Flow profile is stored as A-Flow 3.0');
    await page.getByTestId('settings-confirm-ok').click();
    await expect(page.getByTestId('aflow-import-result')).toHaveText(importReport(plan, { converted: [old], failed: [] }), {
      timeout: 15_000,
    });

    const all = await api<ProfileRecord[]>('GET', '/api/v1/profiles?includeHidden=true');
    const converted = all.find((record) => record.parentId === old.id && record.visibility === 'visible');
    expect(converted?.profile.title).toBe(TITLE);
    expect(converted?.metadata).toMatchObject(SKIN_METADATA);
    expect(readRecord(converted!)).toEqual(plan.convert[0].params);
    expect(all.find((record) => record.id === old.id)?.visibility).toBe('hidden');
    // Of the rig's own profiles none changed its visibility.
    const visible = all.filter((record) => record.visibility === 'visible' && profilesBefore.includes(record.id));
    expect(visible.map((record) => record.id).sort()).toEqual(visibleBefore);
  } finally {
    for (const id of await profileIds()) {
      if (!profilesBefore.includes(id)) await api('DELETE', `/api/v1/profiles/${encodeURIComponent(id)}/purge`);
    }
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
  }

  expect(await profileIds()).toEqual(profilesBefore);
  expect(await api('GET', BACKUP)).toEqual(backupBefore);
});
