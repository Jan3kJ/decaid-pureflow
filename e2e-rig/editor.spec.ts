import { expect, test, type Page } from '@playwright/test';
import { parseParams } from '../src/aflow/codec';
import type { AFlowParams } from '../src/aflow/types';
import { buildProfile } from '../src/editor/save';
import light from '../src/aflow/defaults/default-light.json' with { type: 'json' };

// Acceptance item 3 (spec section 5) against the rig: in simple and in detail mode, changing a
// value redraws the curve, and the profile the gateway holds after 'load to machine' equals the
// generator's output for those values; a saved profile re-opens in the editor with the same
// parameters. The tests remove the profiles they create and put the workflow back as it was.

const GATEWAY = 'http://localhost:8080';
const LIGHT = { title: 'A-Flow / default-light', author: 'Janek' };

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : undefined;
}

/** Every stored profile: the visible, the hidden and the soft-deleted ones. */
async function profileIds(): Promise<string[]> {
  const lists = await Promise.all([
    api('GET', '/api/v1/profiles?includeHidden=true'),
    api('GET', '/api/v1/profiles?visibility=deleted'),
  ]);
  return [...new Set(lists.flat().map((record: { id: string }) => record.id))].sort();
}

/** A value with its keys in order and without nulls: the gateway returns `null` where the generator leaves a field out. */
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) if (value[key] !== null) sorted[key] = canonical(value[key]);
  return sorted;
}

/** The fields the generator writes, as the gateway holds them. */
function held(profile: Record<string, unknown>, expected: object): unknown {
  return canonical(Object.fromEntries(Object.keys(expected).map((key) => [key, profile[key]])));
}

function paramsOf(profile: { notes: string }): AFlowParams {
  const parsed = parseParams(profile.notes);
  if (!parsed.ok) throw new Error(`the notes hold no A-Flow parameters: ${parsed.error}`);
  return parsed.params;
}

const pressed = (page: Page) => page.getByTestId('picker').locator('[aria-pressed="true"]');
const pressurePoints = (page: Page) => page.getByTestId('line-pressure').getAttribute('points');

async function type(page: Page, field: string, keys: string) {
  await page.getByTestId(`chip-edit-${field}`).click();
  for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
}

async function openEditor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('nav-status')).toBeVisible();
}

/** After 'load to machine': the workflow of the gateway, read back, against the generator. */
async function expectLoaded(page: Page, about: { title: string; author: string }): Promise<AFlowParams> {
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const workflow = await api('GET', '/api/v1/workflow');
  const params = paramsOf(workflow.profile);
  const expected = buildProfile(params, about, false);
  expect(held(workflow.profile, expected)).toEqual(canonical(expected));
  expect(workflow.context.targetYield).toBe(params.stopWeight);
  expect(workflow.context.targetDoseWeight).toBe(params.dose);
  await expect(page.getByTestId('profile-name')).toHaveText(about.title);
  return params;
}

let gatewayUp = false;
let workflowBefore: any;
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
  workflowBefore = await api('GET', '/api/v1/workflow');
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
  const workflowAfter = await api('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});

test('simple mode: a changed value redraws the curve, and the gateway holds the generator\'s profile', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByTestId('profile-default-light').click();
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

  await page.getByTestId('load-to-machine').click();
  const params = await expectLoaded(page, LIGHT);
  expect(params).toEqual({ ...light, infusePressure: pressure, stopWeight: 47, pauseDuration: 15 });
  // Dose and stop weight are not on home: the workflow holds them.
  expect((await api('GET', '/api/v1/workflow')).context).toMatchObject({ targetYield: 47, targetDoseWeight: 16 });
  // Loading saves nothing.
  expect(await profileIds()).toEqual(profilesBefore);
});

test('detail mode: typed values are loaded; a saved profile re-opens with them and an edit keeps the lineage', async ({
  page,
}) => {
  const name = `rig d7 ${Date.now() % 100000}`;
  const about = { title: `A-Flow / ${name}`, author: 'Janek' };

  await openEditor(page);
  await page.getByTestId('profile-default-light').click();
  await page.getByTestId('mode-detail').click();
  const before = await pressurePoints(page);
  await page.getByTestId('phase-pressurize').click();
  await type(page, 'pourPressure', '8.5');
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  expect(await pressurePoints(page)).not.toBe(before);
  await type(page, 'rampTime', '7');
  await page.getByTestId('phase-infuse').click();
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
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText(`Saved as “${name}”.`);
  await expect(pressed(page)).toHaveText(name);
  const saved = (await api('GET', '/api/v1/profiles')).find((record: any) => record.profile.title === about.title);
  expect(profilesBefore).not.toContain(saved.id);
  expect(saved.parentId).toBeNull();
  expect(saved.metadata).toEqual({ source: 'decaid-skin', aflow: '3.0' });
  expect(paramsOf(saved.profile)).toEqual(wanted);
  const expected = buildProfile(wanted, about, false);
  expect(held(saved.profile, expected)).toEqual(canonical(expected));

  // Load to machine: the workflow holds the generator's profile for the typed values.
  await page.getByTestId('load-to-machine').click();
  expect(await expectLoaded(page, about)).toEqual(wanted);
  expect((await api('GET', '/api/v1/workflow')).context).toMatchObject({ targetYield: 48, targetDoseWeight: 18.5 });

  // The saved profile re-opens in the editor with the same parameters: as the current profile
  // after a reload, and from the editor's picker.
  await page.getByTestId('open-editor').click();
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(pressed(page)).toHaveText(name);
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  await expect(page.getByTestId('value-rampTime')).toHaveText('7 s');
  await expect(page.getByTestId('value-infuseTemperature')).toHaveText('91 °C');
  await page.getByTestId('profile-default-dark').click();
  await expect(page.getByTestId('value-pourPressure')).toHaveText('9 bar');
  await page.getByTestId('picker').getByRole('button', { name }).click();
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('chip-value-dose')).toHaveText('18.5 g');
  await expect(page.getByTestId('save')).toBeDisabled();

  // The dose alone: the same record, its notes changed with a PUT.
  await type(page, 'dose', '17');
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText(`Saved “${name}”.`);
  const redosed = await api('GET', `/api/v1/profiles/${encodeURIComponent(saved.id)}`);
  expect(paramsOf(redosed.profile)).toEqual({ ...wanted, dose: 17 });

  // An edit of the curve: a new record with the old one as its parent; the old one is hidden.
  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('save').click();
  // The button is also disabled while the save runs: wait for what the gateway lists.
  let listed: any[] = [];
  await expect
    .poll(async () => {
      listed = (await api('GET', '/api/v1/profiles')).filter((record: any) => record.profile.title === about.title);
      return listed.map((record) => record.id === saved.id);
    })
    .toEqual([false]);
  await expect(page.getByTestId('save')).toBeDisabled();
  expect(listed[0].id).not.toBe(saved.id);
  expect(listed[0].parentId).toBe(saved.id);
  expect(paramsOf(listed[0].profile)).toEqual({ ...wanted, dose: 17, flowUp: false });
  const lineage = await api('GET', `/api/v1/profiles/${encodeURIComponent(listed[0].id)}/lineage`);
  expect(lineage.map((record: any) => [record.id, record.visibility])).toEqual([
    [saved.id, 'hidden'],
    [listed[0].id, 'visible'],
  ]);
  await expect(page.getByTestId('picker').getByRole('button', { name })).toHaveCount(1);
});
