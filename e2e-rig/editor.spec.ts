import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot, ProfileRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { decodeParams } from '../src/aflow/codec';
import type { AFlowParams } from '../src/aflow/types';
import { buildProfile } from '../src/editor/save';
import { paramsMetadata, splitNotes, workflowProfile } from '../src/editor/storage';
import light from '../src/aflow/defaults/default-light.json' with { type: 'json' };
import { selectPhase } from '../e2e/touch';

// Acceptance item 3 (spec section 5) against the rig: in simple and in detail mode, changing a
// value redraws the curve, and the profile the gateway holds after the back arrow and after
// 'save as' (there is no 'load to machine' since the founder's notes of 2026-10-13) equals the
// generator's output for those values; a saved profile re-opens in the editor with the same
// parameters. The tests remove the profiles they create and put the workflow back as it was.

const GATEWAY = 'http://localhost:8080';
const LIGHT = { title: 'A-Flow / default-light', author: 'Janek' };

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

/** A value with its keys in order and without nulls: the gateway returns `null` where the generator leaves a field out. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return (value as unknown[]).map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const fields = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(fields).sort()) if (fields[key] !== null) sorted[key] = canonical(fields[key]);
  return sorted;
}

/** The fields the generator writes, as the gateway holds them. */
function held(profile: object, expected: object): unknown {
  return canonical(Object.fromEntries(Object.keys(expected).map((key) => [key, (profile as Record<string, unknown>)[key]])));
}

/** The values of the workflow's copy of a profile: in its notes, as the workflow has no metadata. */
function paramsOf(profile: { notes?: string }): AFlowParams {
  const params = splitNotes(profile.notes).params;
  if (!params) throw new Error('the notes hold no A-Flow parameters');
  return params;
}

/** The values of a stored record: in its metadata, none in its notes (spec 3.6). */
function recordParams(record: { profile: { notes?: string }; metadata?: unknown }): AFlowParams {
  expect(splitNotes(record.profile.notes).params).toBeNull();
  const parsed = decodeParams(record.metadata);
  if (!parsed.ok) throw new Error(`the metadata holds no A-Flow parameters: ${parsed.error}`);
  return parsed.params;
}

const pressed = (page: Page) => page.getByTestId('editor-profile');
const pressurePoints = (page: Page) => page.getByTestId('line-pressure').getAttribute('points');

async function type(page: Page, field: string, keys: string) {
  await page.getByTestId(`chip-edit-${field}`).click();
  for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
}

/** The editor on default-light: it opens on the workflow's profile, so that is put there first. */
async function openEditor(page: Page) {
  await api('PUT', '/api/v1/workflow', { profile: workflowProfile(buildProfile(light, LIGHT, false), light) });
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('nav-home')).toBeVisible();
  await expect(pressed(page)).toHaveText('light');
}

/** The workflow of the gateway, read back, against the generator. */
async function expectWorkflow(about: { title: string; author: string }): Promise<AFlowParams> {
  const workflow = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const params = paramsOf(workflow.profile);
  const expected = workflowProfile(buildProfile(params, about, false), params);
  expect(held(workflow.profile, expected)).toEqual(canonical(expected));
  expect(workflow.context.targetYield).toBe(params.stopWeight);
  expect(workflow.context.targetDoseWeight).toBe(params.dose);
  return params;
}

/** After the back arrow with changes: home, and the workflow read back. */
async function expectLoaded(page: Page, about: { title: string; author: string }): Promise<AFlowParams> {
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('profile-name')).toHaveText(about.title);
  return expectWorkflow(about);
}

/** 'save as' under a name; it loads what it stored. */
async function saveAs(page: Page, name: string) {
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText(`Saved as “${name}” and loaded.`);
  await expect(pressed(page)).toHaveText(name);
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
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});

test("simple mode: a changed value redraws the curve, and the gateway holds the generator's profile", async ({ page }) => {
  await openEditor(page);
  await expect(page.getByTestId('mode-simple')).toHaveAttribute('aria-pressed', 'true');
  const before = await pressurePoints(page);

  const from = await page.locator('line.level[data-field="infusePressure"]').evaluate((line) => {
    const rect = line.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 + 10 };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 30, { steps: 4 });
  await page.mouse.move(from.x, from.y - 60, { steps: 4 });
  await page.mouse.up();
  const pressure = parseFloat((await page.getByTestId('value-infusePressure').textContent())!);
  expect(pressure).toBeGreaterThan(3);
  expect(await pressurePoints(page)).not.toBe(before);
  const chip = page.getByTestId('chip-graph-stopWeight');
  await chip.locator('.body').click();
  await chip.locator('[data-step="minus"]').click();
  await expect(chip).toContainText('47 g');
  await page.getByTestId('toggle-second-fill').click();

  // Back with changes loads them.
  await page.getByTestId('nav-home').click();
  const params = await expectLoaded(page, LIGHT);
  expect(params).toEqual({ ...light, infusePressure: pressure, stopWeight: 47, pauseDuration: 15 });
  // Dose and stop weight are not on home: the workflow holds them.
  expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).context).toMatchObject({ targetYield: 47, targetDoseWeight: 16 });
  // Loading saves nothing.
  expect(await profileIds()).toEqual(profilesBefore);

  // Save as, in simple mode: the editor opens on the loaded values; a change and 'save as'
  // stores them and loads them.
  const name = `rig simple ${Date.now() % 100000}`;
  const about = { title: `A-Flow / ${name}`, author: 'Janek' };
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('chip-graph-stopWeight')).toContainText('47 g');
  await page.getByTestId('toggle-flow').click();
  await saveAs(page, name);
  expect(await expectWorkflow(about)).toEqual({ ...params, flowUp: false });
});

test('detail mode: typed values are loaded; a saved profile re-opens with them and an edit keeps the lineage', async ({ page }) => {
  const name = `rig d7 ${Date.now() % 100000}`;
  const about = { title: `A-Flow / ${name}`, author: 'Janek' };

  await openEditor(page);
  await page.getByTestId('mode-detail').click();
  const before = await pressurePoints(page);
  await selectPhase(page, 'pressurize');
  await type(page, 'pourPressure', '8.5');
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  expect(await pressurePoints(page)).not.toBe(before);
  await type(page, 'rampTime', '7');
  await selectPhase(page, 'infuse');
  await type(page, 'infuseTemperature', '91');
  await type(page, 'dose', '18.5');
  const wanted: AFlowParams = {
    ...light,
    pourPressure: 8.5,
    rampTime: 7,
    infuseTemperature: 91,
    secondFillTemperature: 95,
    dose: 18.5,
  };

  // Save as: a new record of the gateway, with the parameters and no parent.
  await saveAs(page, name);
  const saved = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === about.title)!;
  expect(profilesBefore).not.toContain(saved.id);
  expect(saved.parentId).toBeNull();
  expect(saved.metadata).toEqual({ source: 'pureflow', ...paramsMetadata(wanted) });
  expect(recordParams(saved)).toEqual(wanted);
  const expected = buildProfile(wanted, about, false);
  expect(held(saved.profile, expected)).toEqual(canonical(expected));

  // Save as loaded it: the workflow holds the generator's profile for the typed values.
  expect(await expectWorkflow(about)).toEqual(wanted);
  expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).context).toMatchObject({ targetYield: 48, targetDoseWeight: 18.5 });
  // Back has nothing more to load.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('profile-name')).toHaveText(about.title);
  expect(await expectWorkflow(about)).toEqual(wanted);

  // The saved profile re-opens in the editor with the same parameters: as the current profile
  // after a reload, and from the picker by the editor's shortcut.
  await page.getByTestId('open-editor').click();
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(pressed(page)).toHaveText(name);
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  await expect(page.getByTestId('value-rampTime')).toHaveText('7 s');
  await expect(page.getByTestId('value-infuseTemperature')).toHaveText('91 °C');
  await pressed(page).click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await page.getByTestId('profile-item').filter({ hasText: about.title }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(pressed(page)).toHaveText(name);
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('chip-value-dose')).toHaveText('18.5 g');
  await expect(page.getByTestId('save')).toBeDisabled();

  // The dose alone: the same record, its metadata changed with a PUT.
  await type(page, 'dose', '17');
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText(`Saved “${name}” and loaded.`);
  const redosed = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(saved.id)}`);
  expect(recordParams(redosed)).toEqual({ ...wanted, dose: 17 });

  // An edit of the curve: a new record with the old one as its parent; the old one is hidden.
  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('save').click();
  // The button is also disabled while the save runs: wait for what the gateway lists.
  let listed: ProfileRecord[] = [];
  await expect
    .poll(async () => {
      listed = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).filter((record) => record.profile.title === about.title);
      return listed.map((record) => record.id === saved.id);
    })
    .toEqual([false]);
  await expect(page.getByTestId('save')).toBeDisabled();
  expect(listed[0].id).not.toBe(saved.id);
  expect(listed[0].parentId).toBe(saved.id);
  expect(recordParams(listed[0])).toEqual({ ...wanted, dose: 17, flowUp: false });
  const lineage = await api<ProfileRecord[]>('GET', `/api/v1/profiles/${encodeURIComponent(listed[0].id)}/lineage`);
  expect(lineage.map((record) => [record.id, record.visibility])).toEqual([
    [saved.id, 'hidden'],
    [listed[0].id, 'visible'],
  ]);
  // The save loaded the new version.
  expect(await expectWorkflow(about)).toEqual({ ...wanted, dose: 17, flowUp: false });

  // Back with a change in detail mode loads it, unsaved, under the profile's name.
  await selectPhase(page, 'pressurize');
  await type(page, 'pourPressure', '8');
  await page.getByTestId('nav-home').click();
  expect(await expectLoaded(page, about)).toEqual({ ...wanted, dose: 17, flowUp: false, pourPressure: 8 });
});

test('unsaved edits on the machine: the picker asks before it loads (founder, 2026-10-14)', async ({ page }) => {
  await openEditor(page);
  await page.getByTestId('toggle-flow').click();
  // Leaving by the name loads the change unsaved and opens the picker.
  await pressed(page).click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(await expectWorkflow(LIGHT)).toEqual({ ...light, flowUp: false });

  const dialog = page.getByTestId('unsaved-dialog');
  const other = page.getByTestId('profile-item').filter({ hasText: 'Best practice' }).first();
  const title = (await other.locator('.title').textContent())!;
  await other.click();
  await page.getByTestId('load-profile').click();
  await expect(dialog).toContainText('light has unsaved changes on the machine');
  await page.getByTestId('unsaved-cancel').click();
  await expect(dialog).toHaveCount(0);
  // Cancel loaded nothing: the gateway still holds the unsaved values.
  expect(await expectWorkflow(LIGHT)).toEqual({ ...light, flowUp: false });

  await other.click();
  await page.getByTestId('load-profile').click();
  await page.getByTestId('unsaved-discard').click();
  // Not A-Flow 3.0: the picker opened from the editor comes back to the step editor on it (spec 3.6).
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(pressed(page)).toHaveText(title);
  expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).profile.title).toBe(title);
  expect(await profileIds()).toEqual(profilesBefore);
});

// Review of 2026-10-16, A2 (acceptance 23, second half): a phase dragged to 0 s collapses, its
// button turns it on with 5 s, the infuse-to weight is dragged; the saved profile is the
// generator's for those values and reads back with them.
test('a phase turned off and on again at 5 s, and a dragged infuse weight, save and read back', async ({ page }) => {
  const name = `rig a2 ${Date.now() % 100000}`;
  const about = { title: `A-Flow / ${name}`, author: 'Janek' };
  await openEditor(page);

  const graph = (await page.getByTestId('graph').boundingBox())!;
  const infuse = (await page.getByTestId('column-infuse').boundingBox())!;
  const border = { x: infuse.x + infuse.width, y: graph.y + graph.height * 0.62 };
  await page.mouse.move(border.x, border.y);
  await page.mouse.down();
  await page.mouse.move(border.x - infuse.width / 2, border.y, { steps: 4 });
  await page.mouse.move(border.x - infuse.width - 40, border.y, { steps: 4 });
  await page.mouse.up();
  expect((await page.getByTestId('column-infuse').boundingBox())!.width).toBe(0);
  await page.getByTestId('enable-infuse').click();
  await expect(page.getByTestId('value-infuseTime')).toHaveText('5 s');

  // 5 s is shorter than the 6 g's estimate: the weight's drag leaves the time alone.
  const chip = page.getByTestId('chip-graph-infuseWeight');
  const body = (await chip.locator('.body').boundingBox())!;
  const at = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y, { steps: 4 });
  await page.mouse.move(at.x + 80, at.y, { steps: 4 });
  await page.mouse.up();
  const weight = parseFloat((await chip.locator('.value').textContent())!);
  expect(weight).toBeGreaterThan(6);
  await expect(page.getByTestId('value-infuseTime')).toHaveText('5 s');

  const wanted: AFlowParams = { ...light, infuseTime: 5, infuseWeight: weight };
  await saveAs(page, name);
  const saved = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === about.title)!;
  expect(recordParams(saved)).toEqual(wanted);
  const expected = buildProfile(wanted, about, false);
  expect(held(saved.profile, expected)).toEqual(canonical(expected));
  const read = await api<ProfileRecord>('GET', `/api/v1/profiles/${encodeURIComponent(saved.id)}`);
  expect(recordParams(read)).toEqual(wanted);
  expect(await expectWorkflow(about)).toEqual(wanted);

  // It re-opens with them: the infuse drawn again, no button.
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(pressed(page)).toHaveText(name);
  await expect(page.getByTestId('value-infuseTime')).toHaveText('5 s');
  await expect(chip).toContainText(`${weight} g`);
  await expect(page.getByTestId('enable-infuse')).toHaveCount(0);
});
