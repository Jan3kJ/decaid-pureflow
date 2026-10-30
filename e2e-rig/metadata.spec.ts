import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot, ProfileRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { serializeParams } from '../src/aflow/codec';
import type { AFlowParams } from '../src/aflow/types';
import { buildProfile } from '../src/editor/save';
import { paramsMetadata, splitNotes, workflowProfile } from '../src/editor/storage';
import light from '../src/aflow/defaults/default-light.json' with { type: 'json' };
import { selectPhase } from '../e2e/touch';

// A profile record's `metadata` on the rig, the way the
// skin's A-Flow values are to travel in it. It holds through GET, PUT, the lineage,
// the profile export and import, and Decaid's data export and import. The data import sends an
// archive with this test's own profile only, so the rig's other data is not touched. Every
// test purges the profiles it created and puts the workflow back as it was.
//
// The skin stores the A-Flow values in `metadata`, none in `notes`; a saved
// profile re-opens with every value, the 2nd fill's while it is off too, also after the data
// export and import (cut down as above); a profile of version 1 with the values in its notes
// opens and is moved on its next save.

const GATEWAY = 'http://localhost:8080';

/** A-Flow values with the 2nd fill off (pause 0 s) but its own values set, nulls included. */
const PARAMS = {
  ...light,
  dose: 18.5,
  secondFillFlow: 6.5,
  secondFillTemperature: 91.25,
  secondFillTime: 12,
  pauseDuration: 0,
  pauseExitFlow: 0.8,
  flowUp: false,
};
const METADATA = {
  source: 'pureflow',
  aflow: '3.0',
  params: PARAMS,
  detail: true,
  list: [1, 2.5, 'three', true, null, { four: 4 }],
  text: 'Ümlaut, "quotes", ☕, line\nbreak',
};

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const zip = body instanceof Uint8Array;
  return fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': zip ? 'application/zip' : 'application/json' },
    body: body === undefined ? undefined : zip ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await call(method, path, body);
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const record = (id: string) => `/api/v1/profiles/${encodeURIComponent(id)}`;

/** Every stored profile: the visible, the hidden and the soft-deleted ones. */
async function profileIds(): Promise<string[]> {
  const lists = await Promise.all([
    api<ProfileRecord[]>('GET', '/api/v1/profiles?includeHidden=true'),
    api<ProfileRecord[]>('GET', '/api/v1/profiles?visibility=deleted'),
  ]);
  return [...new Set(lists.flat().map((stored: { id: string }) => stored.id))].sort();
}

/** A temperature no stored profile has, so that the test's records are its own. */
const BASE_TEMPERATURE = 80 + (Date.now() % 1000) / 100;

/** A profile with steps no other record has: the id is a hash of the steps. */
function testProfile(shift = 0) {
  const profile = buildProfile(light, { title: 'M1 metadata check', author: 'pureflow rig' }, false);
  const temperature = BASE_TEMPERATURE + shift;
  return { ...profile, steps: profile.steps.map((step) => ({ ...step, temperature })) };
}

let gatewayUp = false;
let profilesBefore: string[] = [];
let workflowBefore: RigWorkflow;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test.beforeEach(async () => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  profilesBefore = await profileIds();
  workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
});

test.afterEach(async () => {
  if (!gatewayUp) return;
  for (const id of await profileIds()) {
    if (!profilesBefore.includes(id)) await api('DELETE', `${record(id)}/purge`);
  }
  await api('PUT', '/api/v1/workflow', {
    profile: workflowBefore.profile,
    context: {
      targetYield: workflowBefore.context?.targetYield ?? 0,
      targetDoseWeight: workflowBefore.context?.targetDoseWeight ?? null,
    },
  });
  expect(await profileIds()).toEqual(profilesBefore);
  const workflowAfter = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});

test('metadata holds through GET, PUT and the lineage', async () => {
  const profile = testProfile();
  const created = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile, metadata: METADATA });
  expect(created.metadata).toEqual(METADATA);
  expect((await api<ProfileRecord>('GET', record(created.id))).metadata).toEqual(METADATA);

  // Title and notes: same id, metadata kept.
  const renamed = await api<ProfileRecord>('PUT', record(created.id), { profile: { ...profile, title: 'M1 renamed', notes: 'n' } });
  expect(renamed.id).toBe(created.id);
  expect(renamed.metadata).toEqual(METADATA);

  // Other steps: a new id replaces the record, metadata kept.
  const stepped = testProfile(0.5);
  const moved = await api<ProfileRecord>('PUT', record(created.id), { profile: stepped });
  expect(moved.id).not.toBe(created.id);
  expect(moved.metadata).toEqual(METADATA);
  expect((await call('GET', record(created.id))).status).toBe(404);

  // Supplied metadata replaces the stored one; it is not merged.
  const partial = { source: 'pureflow', aflow: '3.0', params: { dose: 20 } };
  expect((await api<ProfileRecord>('PUT', record(moved.id), { metadata: partial })).metadata).toEqual(partial);
  expect((await api<ProfileRecord>('PUT', record(moved.id), { metadata: METADATA })).metadata).toEqual(METADATA);

  // A child posted with parentId does not inherit metadata: it has only what it is sent.
  const bare = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: testProfile(1), parentId: moved.id });
  expect(bare.parentId).toBe(moved.id);
  expect(bare.metadata).toBeNull();
  const child = await api<ProfileRecord>('POST', '/api/v1/profiles', {
    profile: testProfile(1.5),
    parentId: moved.id,
    metadata: METADATA,
  });
  expect(child.metadata).toEqual(METADATA);

  // A hidden parent keeps its metadata, in the lineage too.
  await api('PUT', `${record(moved.id)}/visibility`, { visibility: 'hidden' });
  expect((await api<ProfileRecord>('GET', record(moved.id))).metadata).toEqual(METADATA);
  const lineage = await api<ProfileRecord[]>('GET', `${record(child.id)}/lineage`);
  expect(lineage.map((stored) => stored.id)).toEqual([moved.id, child.id]);
  expect(lineage.every((stored) => JSON.stringify(stored.metadata) === JSON.stringify(METADATA))).toBe(true);
});

test('metadata holds through the profile export and import', async () => {
  const created = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: testProfile(), metadata: METADATA });
  await api('PUT', `${record(created.id)}/visibility`, { visibility: 'hidden' });

  const exported = await api<ProfileRecord[]>('GET', '/api/v1/profiles/export?includeHidden=true');
  const mine = exported.find((stored) => stored.id === created.id)!;
  expect(mine.metadata).toEqual(METADATA);

  await api('DELETE', `${record(created.id)}/purge`);
  expect((await call('GET', record(created.id))).status).toBe(404);
  expect(await api('POST', '/api/v1/profiles/import', [mine])).toMatchObject({ imported: 1, failed: 0 });
  expect((await api<ProfileRecord>('GET', record(created.id))).metadata).toEqual(METADATA);
});

test('metadata holds through the data export and import', async () => {
  const created = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: testProfile(), metadata: METADATA });

  const response = await call('GET', '/api/v1/data/export');
  expect(response.status).toBe(200);
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const mine = (JSON.parse(strFromU8(entries['profiles.json'])) as ProfileRecord[]).find((stored) => stored.id === created.id)!;
  expect(mine.metadata).toEqual(METADATA);

  // Decaid's own export, cut down to this profile: the import touches nothing else.
  const archive = zipSync({ 'metadata.json': entries['metadata.json'], 'profiles.json': strToU8(JSON.stringify([mine])) });
  await api('DELETE', `${record(created.id)}/purge`);
  expect(await api('POST', '/api/v1/data/import', archive)).toMatchObject({ profiles: { imported: 1, status: 'complete' } });
  expect((await api<ProfileRecord>('GET', record(created.id))).metadata).toEqual(METADATA);

  // onConflict=skip keeps a stored record's metadata, overwrite takes the archive's.
  await api<ProfileRecord>('PUT', record(created.id), { metadata: { other: 1 } });
  expect(await api('POST', '/api/v1/data/import?onConflict=skip', archive)).toMatchObject({ profiles: { skipped: 1 } });
  expect((await api<ProfileRecord>('GET', record(created.id))).metadata).toEqual({ other: 1 });
  await api('POST', '/api/v1/data/import?onConflict=overwrite', archive);
  expect((await api<ProfileRecord>('GET', record(created.id))).metadata).toEqual(METADATA);
});

test('metadata takes a large object and refuses one that is not an object', async () => {
  const big = { big: 'x'.repeat(1_000_000) };
  const large = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: testProfile(), metadata: big });
  expect((await api<ProfileRecord>('GET', record(large.id))).metadata).toEqual(big);
  for (const [shift, value] of [
    [1, [1, 2, 3]],
    [2, 'text'],
    [3, 42],
  ] as const) {
    expect((await call('POST', '/api/v1/profiles', { profile: testProfile(shift), metadata: value })).status).toBe(500);
  }
});

// --- The skin's A-Flow values in metadata ---

const LIGHT = { title: 'A-Flow / default-light', author: 'Janek' };
const pressed = (page: Page) => page.getByTestId('editor-profile');

async function type(page: Page, field: string, keys: string) {
  await page.getByTestId(`chip-edit-${field}`).click();
  for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
}

/** The skin on its editor, which opens on the workflow's profile. */
async function openEditor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
}

/** What the editor shows of the values that differ from default-light. */
async function expectOnScreen(page: Page, name: string) {
  await expect(pressed(page)).toHaveText(name);
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.3 bar');
  await expect(page.getByTestId('value-rampTime')).toHaveText('7 s');
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('chip-value-dose')).toHaveText('18.5 g');
  // The 2nd fill is off and kept its values: on, they show; off again, nothing changed.
  await expect(page.getByTestId('toggle-second-fill')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('toggle-second-fill').click();
  await selectPhase(page, 'secondFill');
  await expect(page.getByTestId('chip-value-secondFillFlow')).toContainText('6.5');
  await expect(page.getByTestId('chip-value-secondFillTime')).toContainText('12');
  await page.getByTestId('toggle-second-fill').click();
  await expect(page.getByTestId('save')).toBeDisabled();
}

test('the skin saves the A-Flow values in metadata, none in notes; they re-open as saved, after the data export and import too', async ({
  page,
}) => {
  await api('PUT', '/api/v1/workflow', { profile: workflowProfile(buildProfile(light, LIGHT, false), light) });
  await openEditor(page);
  await expect(pressed(page)).toHaveText('light');
  await page.getByTestId('mode-detail').click();
  // The 2nd fill on, values of its own, then off again.
  await page.getByTestId('toggle-second-fill').click();
  await selectPhase(page, 'secondFill');
  await type(page, 'secondFillFlow', '6.5');
  await type(page, 'secondFillTime', '12');
  await page.getByTestId('toggle-second-fill').click();
  await selectPhase(page, 'pressurize');
  await type(page, 'pourPressure', '8.3');
  await type(page, 'rampTime', '7');
  await type(page, 'dose', '18.5');
  const wanted: AFlowParams = {
    ...light,
    secondFillFlow: 6.5,
    secondFillTime: 12,
    pauseDuration: 0,
    pourPressure: 8.3,
    rampTime: 7,
    dose: 18.5,
  };

  const name = `rig m2 ${Date.now() % 100000}`;
  const title = `A-Flow / ${name}`;
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText(`Saved as “${name}” and loaded.`);

  // The record: the values in its metadata, its notes empty.
  const saved = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((stored) => stored.profile.title === title)!;
  expect(profilesBefore).not.toContain(saved.id);
  expect(saved.metadata).toEqual({ source: 'pureflow', ...paramsMetadata(wanted) });
  expect(saved.profile.notes ?? '').toBe('');
  // The workflow's copy carries them in its notes: the workflow has no metadata.
  expect(splitNotes((await api<RigWorkflow>('GET', '/api/v1/workflow')).profile.notes).params).toEqual(wanted);

  // Re-opened after a reload, every value as saved.
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expectOnScreen(page, name);

  // Decaid's data export, cut down to this profile, purged and imported again.
  const response = await call('GET', '/api/v1/data/export');
  expect(response.status).toBe(200);
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const mine = (JSON.parse(strFromU8(entries['profiles.json'])) as ProfileRecord[]).find((stored) => stored.id === saved.id)!;
  expect(mine.metadata).toEqual(saved.metadata);
  const archive = zipSync({ 'metadata.json': entries['metadata.json'], 'profiles.json': strToU8(JSON.stringify([mine])) });
  await api('DELETE', `${record(saved.id)}/purge`);
  expect((await call('GET', record(saved.id))).status).toBe(404);
  expect(await api('POST', '/api/v1/data/import', archive)).toMatchObject({ profiles: { imported: 1, status: 'complete' } });
  expect((await api<ProfileRecord>('GET', record(saved.id))).metadata).toEqual(saved.metadata);

  // Loaded from the picker, the imported record opens in the editor with every value.
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await pressed(page).click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await page.getByTestId('profile-item').filter({ hasText: title }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expectOnScreen(page, name);
  expect(splitNotes((await api<RigWorkflow>('GET', '/api/v1/workflow')).profile.notes).params).toEqual(wanted);
});

test('a profile with the A-Flow values in its notes opens right and is moved on its next save', async ({ page }) => {
  const name = `rig v1 ${Date.now() % 100000}`;
  const title = `A-Flow / ${name}`;
  const params: AFlowParams = { ...light, pourPressure: 8.2, rampTime: 6, dose: 17 };
  // As version 1 of the skin stored it: the values in the notes, here beside a text of the user.
  const profile = { ...buildProfile(params, { title, author: 'Janek' }, false), notes: `${serializeParams(params)}\nrig note` };
  const v1 = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile, metadata: { source: 'pureflow', aflow: '3.0' } });
  expect(profilesBefore).not.toContain(v1.id);
  // Loaded as another skin loads it: the record's profile as it is.
  await api('PUT', '/api/v1/workflow', { profile: v1.profile, context: { targetYield: params.stopWeight } });

  await openEditor(page);
  await expect(pressed(page)).toHaveText(name);
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.2 bar');
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('chip-value-dose')).toHaveText('17 g');

  // The dose alone keeps the steps and so the id: the record is changed in place and moved.
  await type(page, 'dose', '19');
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText(`Saved “${name}” and loaded.`);
  const moved = await api<ProfileRecord>('GET', record(v1.id));
  expect(moved.profile.notes).toBe('rig note');
  expect(moved.metadata).toEqual({ source: 'pureflow', aflow: '3.0', ...paramsMetadata({ ...params, dose: 19 }) });
  expect(moved.visibility).toBe('visible');

  // Re-opened after a reload, from the picker: the values as saved.
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await pressed(page).click();
  await page.getByTestId('profile-item').filter({ hasText: title }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(pressed(page)).toHaveText(name);
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.2 bar');
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('chip-value-dose')).toHaveText('19 g');
  await expect(page.getByTestId('save')).toBeDisabled();
});
