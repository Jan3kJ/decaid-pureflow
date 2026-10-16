import { expect, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildProfile } from '../src/editor/save';
import light from '../src/aflow/defaults/default-light.json' with { type: 'json' };

// M1 (docs/research.md section 18): a profile record's `metadata` on the rig, the way the
// skin's A-Flow values are to travel in it (spec 3.6). It holds through GET, PUT, the lineage,
// the profile export and import, and Decaid's data export and import. The data import sends an
// archive with this test's own profile only, so the rig's other data is not touched. Every
// test purges the profiles it created.

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
  source: 'decaid-skin',
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

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const response = await call(method, path, body);
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : undefined;
}

const record = (id: string) => `/api/v1/profiles/${encodeURIComponent(id)}`;

/** Every stored profile: the visible, the hidden and the soft-deleted ones. */
async function profileIds(): Promise<string[]> {
  const lists = await Promise.all([
    api('GET', '/api/v1/profiles?includeHidden=true'),
    api('GET', '/api/v1/profiles?visibility=deleted'),
  ]);
  return [...new Set(lists.flat().map((stored: { id: string }) => stored.id))].sort();
}

/** A temperature no stored profile has, so that the test's records are its own. */
const BASE_TEMPERATURE = 80 + (Date.now() % 1000) / 100;

/** A profile with steps no other record has: the id is a hash of the steps (research.md 11.1). */
function testProfile(shift = 0) {
  const profile = buildProfile(light, { title: 'M1 metadata check', author: 'decaid-skin rig' }, false);
  const temperature = BASE_TEMPERATURE + shift;
  return { ...profile, steps: profile.steps.map((step) => ({ ...step, temperature })) };
}

let gatewayUp = false;
let profilesBefore: string[] = [];

test.beforeAll(async () => {
  try {
    gatewayUp = (await api('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test.beforeEach(async () => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  profilesBefore = await profileIds();
});

test.afterEach(async () => {
  if (!gatewayUp) return;
  for (const id of await profileIds()) {
    if (!profilesBefore.includes(id)) await api('DELETE', `${record(id)}/purge`);
  }
  expect(await profileIds()).toEqual(profilesBefore);
});

test('metadata holds through GET, PUT and the lineage', async () => {
  const profile = testProfile();
  const created = await api('POST', '/api/v1/profiles', { profile, metadata: METADATA });
  expect(created.metadata).toEqual(METADATA);
  expect((await api('GET', record(created.id))).metadata).toEqual(METADATA);

  // Title and notes: same id, metadata kept.
  const renamed = await api('PUT', record(created.id), { profile: { ...profile, title: 'M1 renamed', notes: 'n' } });
  expect(renamed.id).toBe(created.id);
  expect(renamed.metadata).toEqual(METADATA);

  // Other steps: a new id replaces the record, metadata kept.
  const stepped = testProfile(0.5);
  const moved = await api('PUT', record(created.id), { profile: stepped });
  expect(moved.id).not.toBe(created.id);
  expect(moved.metadata).toEqual(METADATA);
  expect((await call('GET', record(created.id))).status).toBe(404);

  // Supplied metadata replaces the stored one; it is not merged.
  const partial = { source: 'decaid-skin', aflow: '3.0', params: { dose: 20 } };
  expect((await api('PUT', record(moved.id), { metadata: partial })).metadata).toEqual(partial);
  expect((await api('PUT', record(moved.id), { metadata: METADATA })).metadata).toEqual(METADATA);

  // A child posted with parentId does not inherit metadata: it has only what it is sent.
  const bare = await api('POST', '/api/v1/profiles', { profile: testProfile(1), parentId: moved.id });
  expect(bare.parentId).toBe(moved.id);
  expect(bare.metadata).toBeNull();
  const child = await api('POST', '/api/v1/profiles', { profile: testProfile(1.5), parentId: moved.id, metadata: METADATA });
  expect(child.metadata).toEqual(METADATA);

  // A hidden parent keeps its metadata, in the lineage too.
  await api('PUT', `${record(moved.id)}/visibility`, { visibility: 'hidden' });
  expect((await api('GET', record(moved.id))).metadata).toEqual(METADATA);
  const lineage = await api('GET', `${record(child.id)}/lineage`);
  expect(lineage.map((stored: any) => stored.id)).toEqual([moved.id, child.id]);
  expect(lineage.every((stored: any) => JSON.stringify(stored.metadata) === JSON.stringify(METADATA))).toBe(true);
});

test('metadata holds through the profile export and import', async () => {
  const created = await api('POST', '/api/v1/profiles', { profile: testProfile(), metadata: METADATA });
  await api('PUT', `${record(created.id)}/visibility`, { visibility: 'hidden' });

  const exported = await api('GET', '/api/v1/profiles/export?includeHidden=true');
  const mine = exported.find((stored: any) => stored.id === created.id);
  expect(mine.metadata).toEqual(METADATA);

  await api('DELETE', `${record(created.id)}/purge`);
  expect((await call('GET', record(created.id))).status).toBe(404);
  expect(await api('POST', '/api/v1/profiles/import', [mine])).toMatchObject({ imported: 1, failed: 0 });
  expect((await api('GET', record(created.id))).metadata).toEqual(METADATA);
});

test('metadata holds through the data export and import', async () => {
  const created = await api('POST', '/api/v1/profiles', { profile: testProfile(), metadata: METADATA });

  const response = await call('GET', '/api/v1/data/export');
  expect(response.status).toBe(200);
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const mine = JSON.parse(strFromU8(entries['profiles.json'])).find((stored: any) => stored.id === created.id);
  expect(mine.metadata).toEqual(METADATA);

  // Decaid's own export, cut down to this profile: the import touches nothing else.
  const archive = zipSync({ 'metadata.json': entries['metadata.json'], 'profiles.json': strToU8(JSON.stringify([mine])) });
  await api('DELETE', `${record(created.id)}/purge`);
  expect(await api('POST', '/api/v1/data/import', archive)).toMatchObject({ profiles: { imported: 1, status: 'complete' } });
  expect((await api('GET', record(created.id))).metadata).toEqual(METADATA);

  // onConflict=skip keeps a stored record's metadata, overwrite takes the archive's.
  await api('PUT', record(created.id), { metadata: { other: 1 } });
  expect(await api('POST', '/api/v1/data/import?onConflict=skip', archive)).toMatchObject({ profiles: { skipped: 1 } });
  expect((await api('GET', record(created.id))).metadata).toEqual({ other: 1 });
  await api('POST', '/api/v1/data/import?onConflict=overwrite', archive);
  expect((await api('GET', record(created.id))).metadata).toEqual(METADATA);
});

test('metadata takes a large object and refuses one that is not an object', async () => {
  const big = { big: 'x'.repeat(1_000_000) };
  const large = await api('POST', '/api/v1/profiles', { profile: testProfile(), metadata: big });
  expect((await api('GET', record(large.id))).metadata).toEqual(big);
  for (const [shift, value] of [[1, [1, 2, 3]], [2, 'text'], [3, 42]] as const) {
    expect((await call('POST', '/api/v1/profiles', { profile: testProfile(shift), metadata: value })).status).toBe(500);
  }
});
