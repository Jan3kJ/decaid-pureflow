import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import { insertStepAfter, moveStep, removeStepAt, setValue, stepValue } from '../src/steps/model';

// Acceptance item 10 (spec 3.6, research.md 17.11) against the rig: a profile that is not
// A-Flow opens in the step editor; a value changed with ± and with the pad, a step added, one
// deleted and one moved, saved as a copy of a bundled profile, then edited once more and
// saved, give a stored profile whose steps equal the edit, and Decaid's lineage holds both
// versions. The test
// purges the profiles it made and puts the workflow back as it was.

const GATEWAY = 'http://localhost:8080';
const SOURCE = 'Blooming Espresso';

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

/** A value with its keys in order and without nulls: the gateway returns `null` for a field left out. */
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) if (value[key] !== null) sorted[key] = canonical(value[key]);
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
});

test('a bundled profile opens in the step editor; its edited copy is stored with its steps and in the lineage', async ({
  page,
}) => {
  const source = (await api('GET', '/api/v1/profiles')).find((record: any) => record.profile.title === SOURCE);
  expect(source, `the rig bundles “${SOURCE}”`).toBeTruthy();
  expect(source.isDefault).toBe(true);
  await api('PUT', '/api/v1/workflow', { profile: source.profile });

  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('graph')).toHaveCount(0);
  await expect(page.getByTestId('editor-profile')).toHaveText(SOURCE);
  await expect(page.getByTestId('step-count')).toHaveText(`${source.profile.steps.length} steps`);
  // A bundled default: 'save as' only.
  await expect(page.getByTestId('save')).toBeDisabled();

  // The edits of acceptance 10, on screen and, for the expected result, with the model.
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
  const copies = (await api('GET', '/api/v1/profiles')).filter((record: any) => record.profile.title === title);
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
  const listed = (await api('GET', '/api/v1/profiles')).filter((record: any) => record.profile.title === title);
  expect(listed).toHaveLength(1);
  const saved = listed[0];
  expect(saved.id).not.toBe(copy.id);
  expect(saved.parentId).toBe(copy.id);
  expect(canonical(saved.profile.steps)).toEqual(canonical(expected.steps));
  expect(saved.profile.target_volume_count_start).toBe(expected.target_volume_count_start);
  // The parent's metadata (a bundled profile's `filename`), marked as the skin's.
  expect(saved.metadata).toEqual({ ...source.metadata, source: 'decaid-skin' });
  // Decaid's lineage holds both versions: the copy hidden, the edit visible.
  const lineage = await api('GET', `/api/v1/profiles/${encodeURIComponent(saved.id)}/lineage`);
  const versions = Object.fromEntries(lineage.map((record: any) => [record.id, record.visibility]));
  expect(versions[copy.id]).toBe('hidden');
  expect(versions[saved.id]).toBe('visible');
  // The bundled profile is as it was, and the machine has the saved steps.
  const after = await api('GET', `/api/v1/profiles/${encodeURIComponent(source.id)}`);
  expect(after.visibility).toBe('visible');
  expect(canonical(after.profile)).toEqual(canonical(source.profile));
  const workflow = await api('GET', '/api/v1/workflow');
  expect(canonical(workflow.profile.steps)).toEqual(canonical(expected.steps));
  await expect(page.getByTestId('save')).toBeDisabled();
});
