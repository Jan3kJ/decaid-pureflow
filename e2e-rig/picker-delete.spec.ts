import { expect, test } from '@playwright/test';
import type { MachineSnapshot, Profile, ProfileRecord } from '../src/api';
import { swipe } from '../e2e/touch';

// The picker's delete against the rig (spec 3.10 'Profile picker: delete a profile', acceptance
// 60): a profile stored for the test is swiped, deleted and confirmed in the skin; Decaid then
// lists as many profiles as before it was stored. The skin's delete is soft (the record stays,
// marked deleted), so the test purges the record afterwards and checks that the store holds as
// many records, hidden ones too, as before.

const GATEWAY = 'http://localhost:8080';
const TITLE = 'pureflow rig delete test';

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

const count = async (query = '') => (await api<ProfileRecord[]>('GET', `/api/v1/profiles${query}`)).length;

// Steps no other profile has, so the record is the test's own.
const PROFILE: Profile = {
  version: '2',
  title: TITLE,
  author: 'pureflow rig test',
  notes: '',
  beverage_type: 'espresso',
  steps: [
    {
      name: 'pour',
      pump: 'flow',
      transition: 'fast',
      exit: null,
      volume: 0,
      seconds: 23.7,
      weight: 0,
      temperature: 91.3,
      sensor: 'coffee',
      flow: 2.1,
      limiter: null,
    },
  ],
  target_volume: 0,
  target_weight: 37.7,
  target_volume_count_start: 0,
  tank_temperature: 0,
};

let gatewayUp = false;
let created: string | null = null;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test.afterAll(async () => {
  if (created) await api('DELETE', `/api/v1/profiles/${encodeURIComponent(created)}/purge`);
});

test('a profile swiped and deleted in the picker leaves the list; the count is back to before', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  test.setTimeout(120_000);
  const visibleBefore = await count();
  const allBefore = await count('?includeHidden=true');
  const workflowBefore = await api<{ profile: Profile }>('GET', '/api/v1/workflow');

  const record = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: PROFILE });
  created = record.id;
  expect(record.visibility).toBe('visible');
  expect(await count()).toBe(visibleBefore + 1);

  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-filter').fill(TITLE);
  const item = page.getByTestId('profile-item').filter({ hasText: TITLE });
  await expect(item).toHaveCount(1, { timeout: 15_000 });
  const box = (await item.boundingBox())!;
  const from = { x: box.x + box.width - 60, y: box.y + box.height / 2 };
  await swipe(page, from, { x: from.x - 200, y: from.y + 4 });
  await page.getByTestId('profile-delete').click();
  await expect(page.getByTestId('settings-confirm')).toContainText(`Delete ${TITLE}?`);
  await page.getByTestId('settings-confirm-ok').click();
  await expect(item).toHaveCount(0);
  await expect(page.getByTestId('profiles-error')).toHaveCount(0);

  // Decaid lists as many as before; the record stays, marked deleted, until the purge.
  expect(await count()).toBe(visibleBefore);
  const stored = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(record.id)}`);
  expect(stored.visibility).toBe('deleted');
  // The workflow is untouched.
  expect((await api<{ profile: Profile }>('GET', '/api/v1/workflow')).profile.title).toBe(workflowBefore.profile.title);

  await api('DELETE', `/api/v1/profiles/${encodeURIComponent(record.id)}/purge`);
  created = null;
  expect(await count('?includeHidden=true')).toBe(allBefore);
});
