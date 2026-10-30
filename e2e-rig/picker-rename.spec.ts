import { expect, test } from '@playwright/test';
import type { MachineSnapshot, Profile, ProfileRecord } from '../src/api';
import { swipe } from '../e2e/touch';

// The picker's rename against the rig: a profile stored for
// the test with metadata is moved to the right, renamed in the skin's dialog, and read back from
// Decaid under the new title with the same id and the same metadata. The record is purged
// afterwards and the store holds as many records, hidden ones too, as before.

const GATEWAY = 'http://localhost:8080';
const TITLE = 'pureflow rig rename test';
const RENAMED = 'pureflow rig renamed test';
const METADATA = { source: 'pureflow-rig-test', dose: 18.3 };

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
      seconds: 24.3,
      weight: 0,
      temperature: 90.7,
      sensor: 'coffee',
      flow: 1.9,
      limiter: null,
    },
  ],
  target_volume: 0,
  target_weight: 38.3,
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

test('a profile moved to the right and renamed keeps its id and metadata under the new title', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  test.setTimeout(120_000);
  const allBefore = await count('?includeHidden=true');
  const workflowBefore = await api<{ profile: Profile }>('GET', '/api/v1/workflow');

  const record = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: PROFILE, metadata: METADATA });
  created = record.id;
  expect(record.metadata).toEqual(METADATA);

  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-filter').fill('pureflow rig');
  const item = (title: string) => page.getByTestId('profile-item').filter({ hasText: title });
  await expect(item(TITLE)).toHaveCount(1, { timeout: 15_000 });
  const box = (await item(TITLE).boundingBox())!;
  const from = { x: box.x + 60, y: box.y + box.height / 2 };
  await swipe(page, from, { x: from.x + 200, y: from.y + 4 });
  await page.getByTestId('profile-rename').click();
  await expect(page.getByTestId('settings-confirm-field')).toHaveValue(TITLE);
  await page.getByTestId('settings-confirm-field').fill(RENAMED);
  await page.getByTestId('settings-confirm-ok').click();
  await expect(item(RENAMED)).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(item(TITLE)).toHaveCount(0);
  await expect(page.getByTestId('profiles-error')).toHaveCount(0);

  // Read back: the same id, the new title, the steps and the metadata kept.
  const stored = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(record.id)}`);
  expect(stored.id).toBe(record.id);
  expect(stored.profile.title).toBe(RENAMED);
  expect(stored.profile.steps).toHaveLength(1);
  expect(stored.profile.target_weight).toBe(PROFILE.target_weight);
  expect(stored.metadata).toEqual(METADATA);
  expect(stored.visibility).toBe('visible');
  // Not the loaded profile: the workflow is untouched.
  expect((await api<{ profile: Profile }>('GET', '/api/v1/workflow')).profile.title).toBe(workflowBefore.profile.title);

  await api('DELETE', `/api/v1/profiles/${encodeURIComponent(record.id)}/purge`);
  created = null;
  expect(await count('?includeHidden=true')).toBe(allBefore);
});
