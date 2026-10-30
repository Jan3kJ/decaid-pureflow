import { expect, test, type Page } from '@playwright/test';
import type { Profile, MachineSnapshot, ProfileRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { cyclePump, insertStepAfter, moveStep, removeStepAt, setValue, stepValue } from '../src/steps/model';

// The step editor against the rig: a profile that is not
// A-Flow opens in the step editor; a value changed with ± and with the pad, a step added, one
// deleted and one moved, saved as a copy of a bundled profile, then edited once more and
// saved, give a stored profile whose steps equal the edit, and Decaid's lineage holds both
// versions. The test
// purges the profiles it made and puts the workflow back as it was.

const GATEWAY = 'http://localhost:8080';
const SOURCE = 'Blooming Espresso';

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

/** A value with its keys in order and without nulls: the gateway returns `null` for a field left out. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return (value as unknown[]).map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const fields = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(fields).sort()) if (fields[key] !== null) sorted[key] = canonical(fields[key]);
  return sorted;
}

const card = (page: Page, index: number) => page.getByTestId(`step-card-${index}`);
const notice = (page: Page) => page.getByTestId('editor-notice');

async function type(page: Page, testid: string, keys: string) {
  await page.getByTestId(`chip-edit-${testid}`).click();
  for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
}

let gatewayUp = false;
let workflowBefore: RigWorkflow;
let profilesBefore: string[] = [];

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test.beforeEach(async () => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  profilesBefore = await profileIds();
});

test.afterEach(async () => {
  if (!gatewayUp) return;
  for (const id of await profileIds()) {
    if (!profilesBefore.includes(id)) await api('DELETE', `/api/v1/profiles/${encodeURIComponent(id)}/purge`);
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
});

test('a bundled profile opens in the step editor; its edited copy is stored with its steps and in the lineage', async ({ page }) => {
  const source = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === SOURCE)!;
  expect(source, `the rig bundles “${SOURCE}”`).toBeTruthy();
  expect(source.isDefault).toBe(true);
  await api('PUT', '/api/v1/workflow', { profile: source.profile });

  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('graph')).toHaveCount(0);
  await expect(page.getByTestId('editor-profile')).toHaveText(SOURCE);
  await expect(page.getByTestId('step-count')).toHaveText(`${source.profile.steps.length} steps`);
  // A bundled default: 'save as' only.
  await expect(page.getByTestId('save')).toBeDisabled();

  // The edits, on screen and, for the expected result, with the model.
  let expected: Profile = structuredClone(source.profile);
  await page.getByTestId('chip-0-temperature').locator('[data-step="plus"]').click();
  expected = stepValue(expected, 0, 'temperature', 1);
  await card(page, 1).click();
  await type(page, '1-target', '3.5');
  expected = setValue(expected, 1, 'target', 3.5);
  await expect(page.getByTestId('chip-value-1-target')).toHaveText('3.5 ml/s');
  await page.getByTestId('step-insert-1').click();
  expected = insertStepAfter(expected, 1);
  await card(page, 0).click();
  await page.getByTestId('step-delete-0').click();
  await page.getByTestId('delete-confirm').click();
  expected = removeStepAt(expected, 0);
  await card(page, 3).click();
  await page.getByTestId('step-move-left-3').click();
  expected = moveStep(expected, 3, 2);
  await expect(page.getByTestId('step-count')).toHaveText(`${expected.steps.length} steps`);

  // 'save as': the edited copy, with the bundled profile as its parent; the source stays visible.
  const title = `E2 rig ${Date.now().toString(36)}`;
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill(title);
  await page.getByTestId('save-confirm').click();
  await expect(notice(page)).toHaveText(`Saved as “${title}” and loaded.`);
  const copies = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).filter((record) => record.profile.title === title);
  expect(copies).toHaveLength(1);
  const copy = copies[0];
  expect(copy.parentId).toBe(source.id);
  expect(canonical(copy.profile.steps)).toEqual(canonical(expected.steps));

  // One more edit of the copy, then 'save': a new version of it.
  await expect(page.getByTestId('save')).toBeDisabled();
  await page.getByTestId('chip-2-seconds').locator('[data-step="plus"]').click();
  expected = stepValue(expected, 2, 'seconds', 1);
  await page.getByTestId('save').click();
  await expect(notice(page)).toHaveText(`Saved “${title}” and loaded.`);

  // Read back: one visible profile of that title, a new record whose parent is the copy.
  const listed = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).filter((record) => record.profile.title === title);
  expect(listed).toHaveLength(1);
  const saved = listed[0];
  expect(saved.id).not.toBe(copy.id);
  expect(saved.parentId).toBe(copy.id);
  expect(canonical(saved.profile.steps)).toEqual(canonical(expected.steps));
  expect(saved.profile.target_volume_count_start).toBe(expected.target_volume_count_start);
  // The parent's metadata (a bundled profile's `filename`), marked as the skin's.
  expect(saved.metadata).toEqual({ ...source.metadata, source: 'pureflow' });
  // Decaid's lineage holds both versions: the copy hidden, the edit visible.
  const lineage = await api<ProfileRecord[]>('GET', `/api/v1/profiles/${encodeURIComponent(saved.id)}/lineage`);
  const versions = Object.fromEntries(lineage.map((record) => [record.id, record.visibility]));
  expect(versions[copy.id]).toBe('hidden');
  expect(versions[saved.id]).toBe('visible');
  // The bundled profile is as it was, and the machine has the saved steps.
  const after = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(source.id)}`);
  expect(after.visibility).toBe('visible');
  expect(canonical(after.profile)).toEqual(canonical(source.profile));
  const workflow = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(canonical(workflow.profile.steps)).toEqual(canonical(expected.steps));
  await expect(page.getByTestId('save')).toBeDisabled();
});

// The step editor's preview and SETTINGS against the rig: the preview follows a step edit;
// title, notes, target weight, target volume and tank temperature edited in SETTINGS are
// stored with the profile and read back; a later change of the title alone, and of the notes
// alone, is stored too. What Decaid hashes of them is written to the test's output.
test('the profile settings are saved with the steps and read back', async ({ page }) => {
  const source = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === SOURCE)!;
  expect(source, `the rig bundles “${SOURCE}”`).toBeTruthy();
  await api('PUT', '/api/v1/workflow', { profile: source.profile });

  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('step-cards')).toBeVisible();
  const preview = page.getByTestId('step-preview');
  await expect(preview.getByTestId('shot-border')).toHaveCount(source.profile.steps.length - 1);
  const before = await preview.getByTestId('shot-target-flow').getAttribute('d');
  await page.getByTestId('chip-0-seconds').locator('[data-step="plus"]').click();
  await expect.poll(() => preview.getByTestId('shot-target-flow').getAttribute('d')).not.toBe(before);

  // A copy first: a bundled profile is saved under a new name only.
  const title = `E3 rig ${Date.now().toString(36)}`;
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill(title);
  await page.getByTestId('save-confirm').click();
  await expect(notice(page)).toHaveText(`Saved as “${title}” and loaded.`);
  const copy = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === title)!;

  // SETTINGS: every value, then 'save'.
  const renamed = `${title} b`;
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('setting-title').fill(renamed);
  await page.getByTestId('setting-notes').fill('E3 rig notes');
  await type(page, 'setting-target_weight', '40.5');
  await type(page, 'setting-target_volume', '60');
  await type(page, 'setting-tank_temperature', '35');
  await page.getByTestId('save').click();
  await expect(notice(page)).toHaveText(`Saved “${renamed}” and loaded.`);
  const wanted = { title: renamed, notes: 'E3 rig notes', target_weight: 40.5, target_volume: 60, tank_temperature: 35 };
  const listed = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).filter((record) => record.profile.title === renamed);
  expect(listed).toHaveLength(1);
  const saved = listed[0];
  expect(saved.profile).toMatchObject(wanted);
  const read = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(saved.id)}`);
  expect(read.profile).toMatchObject(wanted);
  expect(canonical(read.profile.steps)).toEqual(canonical(copy.profile.steps));
  // The target weight is in the id: a new version, the copy hidden.
  expect(saved.id).not.toBe(copy.id);
  expect(saved.parentId).toBe(copy.id);
  expect((await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(copy.id)}`)).visibility).toBe('hidden');
  expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).profile).toMatchObject(wanted);

  // The title alone, then the notes alone: the same record, changed.
  const third = `${title} c`;
  await page.getByTestId('setting-title').fill(third);
  await page.getByTestId('save').click();
  await expect(notice(page)).toHaveText(`Saved “${third}” and loaded.`);
  await page.getByTestId('setting-notes').fill('E3 rig notes, again');
  await page.getByTestId('save').click();
  await expect(notice(page)).toHaveText(`Saved “${third}” and loaded.`);
  const last = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).filter((record) => record.profile.title === third);
  expect(last).toHaveLength(1);
  expect(last[0].profile).toMatchObject({ ...wanted, title: third, notes: 'E3 rig notes, again' });
  expect(last[0].id).toBe(saved.id);
  expect((await api<ProfileRecord[]>('GET', '/api/v1/profiles')).some((record) => record.profile.title === renamed)).toBe(false);

  // What Decaid hashes: does a change of the tank temperature, or of the target volume, alone give a new id?
  const probe = async (change: Record<string, number>) => {
    const answer = await api<ProfileRecord>('POST', '/api/v1/profiles', { profile: { ...read.profile, ...change } });
    const fresh = answer.id !== read.id;
    if (fresh) await api('DELETE', `/api/v1/profiles/${encodeURIComponent(answer.id)}/purge`);
    return fresh;
  };
  console.log(
    `hashed: tank_temperature ${await probe({ tank_temperature: 36 })}, target_volume ${await probe({ target_volume: 61 })}`,
  );
});

// SCRIPT against the rig: in SCRIPT a tap
// on a state word cycles it and a tap on a number opens the pad; both move the preview, and
// 'save as' from the tab stores exactly those steps, which are read back; all made is purged.
test('the SCRIPT tab: a cycled word and a typed number are stored', async ({ page }) => {
  const source = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === SOURCE)!;
  expect(source, `the rig bundles “${SOURCE}”`).toBeTruthy();
  await api('PUT', '/api/v1/workflow', { profile: source.profile });

  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await page.getByTestId('tab-script').click();
  await expect(page.getByTestId('step-script').locator('textarea, input')).toHaveCount(0);
  const flow = () => page.getByTestId('step-preview').getByTestId('shot-target-flow').getAttribute('d');
  const before = await flow();

  // Step 4, "ramp": the pump cycled to pressure quickly; step 5, "flat flow": the flow typed from 2.2 to 3.0 ml/s.
  await page.getByTestId('script-chip-3-pump').click();
  await expect(page.getByTestId('script-chip-3-pump')).toHaveText('Pressure quickly');
  await expect.poll(flow).not.toBe(before);
  const cycled = await flow();
  await page.getByTestId('script-value-4-target').click();
  for (const key of ['3', 'dot', '0']) await page.getByTestId(`numpad-key-${key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('script-value-4-target')).toHaveText('3.0 mL/s');
  await expect.poll(flow).not.toBe(cycled);

  const title = `E6 rig ${Date.now().toString(36)}`;
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill(title);
  await page.getByTestId('save-confirm').click();
  await expect(notice(page)).toHaveText(`Saved as “${title}” and loaded.`);
  const copies = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).filter((record) => record.profile.title === title);
  expect(copies).toHaveLength(1);
  expect(copies[0].parentId).toBe(source.id);
  const expected = setValue(cyclePump(structuredClone(source.profile), 3), 4, 'target', 3);
  expect(expected.steps[3].pump).toBe('pressure');
  // The skin sends the ramp's old flow along (the cards keep it to switch back to); Decaid
  // stores a pressure step without the unused pump's value.
  delete expected.steps[3].flow;
  const read = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(copies[0].id)}`);
  expect(canonical(read.profile.steps)).toEqual(canonical(expected.steps));
  expect(read.profile.target_volume_count_start).toBe(source.profile.target_volume_count_start);
  expect(canonical((await api<RigWorkflow>('GET', '/api/v1/workflow')).profile.steps)).toEqual(canonical(expected.steps));
});

// Muted lines against the rig: in SCRIPT step 2's exit cycled to off
// and step 5's limit typed 0 stay muted lines; 'save as' stores them as Decaid stores a step
// without them (`exit: null`, `limiter: null`, as the bundled profiles hold), and they read back
// so. The test purges the copy and puts the workflow back.
test('SCRIPT: an exit and a limit set off are stored as none and read back', async ({ page }) => {
  const source = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === SOURCE)!;
  expect(source, `the rig bundles “${SOURCE}”`).toBeTruthy();
  expect(source.profile.steps[1].exit).not.toBeNull();
  expect(source.profile.steps[4].limiter?.value).toBeGreaterThan(0);
  await api('PUT', '/api/v1/workflow', { profile: source.profile });

  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await page.getByTestId('tab-script').click();
  for (let n = 0; n < 4; n++) await page.getByTestId('script-chip-1-exit').click();
  await expect(page.getByTestId('script-line-1-exit')).toHaveText(/Move on:\s+off/);
  await page.getByTestId('script-value-4-limiter').click();
  await page.getByTestId('numpad-key-0').click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('script-line-4-limit')).toHaveText(/No limit\s+switch on/);

  const title = `U6 rig ${Date.now().toString(36)}`;
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill(title);
  await page.getByTestId('save-confirm').click();
  await expect(notice(page)).toHaveText(`Saved as “${title}” and loaded.`);
  const copies = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).filter((record) => record.profile.title === title);
  expect(copies).toHaveLength(1);
  const read = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(copies[0].id)}`);
  expect(read.profile.steps[1].exit ?? null).toBeNull();
  expect(read.profile.steps[4].limiter ?? null).toBeNull();
  const expected = structuredClone(source.profile);
  expected.steps[1].exit = null;
  expected.steps[4].limiter = null;
  expect(canonical(read.profile.steps)).toEqual(canonical(expected.steps));
  // Opened again from Decaid, SCRIPT shows them off.
  await page.reload();
  await page.getByTestId('tab-script').click();
  await expect(page.getByTestId('script-line-1-exit')).toHaveAttribute('data-off', 'true');
  await expect(page.getByTestId('script-line-4-limit')).toHaveAttribute('data-off', 'true');
});
