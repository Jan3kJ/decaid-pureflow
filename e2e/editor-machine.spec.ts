import { expect, test, type Page } from '@playwright/test';
import { parseParams } from '../src/aflow/codec';
import type { AFlowParams } from '../src/aflow/types';
import { buildProfile } from '../src/editor/save';
import { mockGateway, type MockGateway } from './mock-gateway';
import light from '../src/aflow/defaults/default-light.json' with { type: 'json' };

// The editor wired to the generator and the machine (D7), against a mocked gateway: it opens on
// the current profile, saves with Decaid's lineage and loads what the generator writes. There
// is no 'load to machine': 'save' and 'save as' load what they stored, and leaving the editor
// loads the values on screen when they changed (founder, 2026-10-13).

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const morning: AFlowParams = { ...light, infusePressure: 2.4, stopWeight: 44, dose: 17.5 };
const MORNING = { title: 'A-Flow / morning', author: 'Janek' };

/** A gateway that holds 'morning' as a saved profile and as the workflow's profile. */
async function withMorning(page: Page): Promise<MockGateway> {
  const gateway = await mockGateway(page);
  const profile = buildProfile(morning, MORNING, false);
  gateway.profiles.push({
    id: 'profile:morning',
    profile,
    metadataHash: 'm',
    compoundHash: 'c',
    parentId: null,
    visibility: 'visible',
    isDefault: false,
    createdAt: '2026-10-13T04:00:00Z',
    updatedAt: '2026-10-13T04:00:00Z',
    metadata: { source: 'decaid-skin', aflow: '3.0' },
  });
  gateway.workflow.profile = profile;
  return gateway;
}

async function openEditor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
}

const pressed = (page: Page) => page.getByTestId('editor-profile');
const pressurePoints = (page: Page) => page.getByTestId('line-pressure').getAttribute('points');
const number = async (page: Page, testid: string) => parseFloat((await page.getByTestId(testid).textContent())!);

async function type(page: Page, field: string, keys: string) {
  await page.getByTestId(`chip-edit-${field}`).click();
  for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
}

/** The one PUT of the workflow a load sent, checked against the generator. */
function loadedProfile(gateway: MockGateway, title: string, author: string, workaround = false) {
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  const { profile, context } = puts[0].body;
  const parsed = parseParams(profile.notes);
  if (!parsed.ok) throw new Error(parsed.error);
  // The profile sent to the machine equals the generator's output for the values (acceptance 3).
  expect(profile).toEqual(buildProfile(parsed.params, { title, author }, workaround));
  expect(context).toEqual({ targetYield: parsed.params.stopWeight, targetDoseWeight: parsed.params.dose });
  expect(profile.target_weight).toBe(parsed.params.stopWeight);
  expect(gateway.calls('POST', '/api/v1/machine/profile')).toHaveLength(0);
  return parsed.params;
}

test('a profile that is not A-Flow is not edited, and the editor says so', async ({ page }) => {
  const gateway = await mockGateway(page);
  await openEditor(page);

  // The mock's workflow holds the plugin's default as Decaid bundles it.
  await expect(page.getByTestId('editor-notice')).toContainText('“A-Flow / default-medium” is not an A-Flow 3.0 profile');
  await expect(page.getByTestId('editor-notice')).toContainText('not edited');
  // A new profile starts from the first default.
  await expect(pressed(page)).toHaveText('floral');
  await expect(page.getByTestId('save')).toBeDisabled();
  await expect(page.getByTestId('load-to-machine')).toHaveCount(0);
  // Back without a change loads nothing: the machine keeps its profile.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('the editor opens on the current A-Flow 3.0 profile and saves an edit with its parent', async ({ page }) => {
  const gateway = await withMorning(page);
  await openEditor(page);

  await expect(pressed(page)).toHaveText('morning');
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);
  await expect(page.getByTestId('value-infusePressure')).toHaveText('2.4 bar');
  await expect(page.getByTestId('chip-graph-stopWeight')).toContainText('44 g');
  // Nothing changed yet: nothing to save.
  await expect(page.getByTestId('save')).toBeDisabled();

  await page.getByTestId('toggle-flow').click();
  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “morning” and loaded.');

  // Decaid's lineage: the new record names the old one as its parent, and the old one is hidden.
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.parentId).toBe('profile:morning');
  expect(posts[0].body.metadata).toEqual({ source: 'decaid-skin', aflow: '3.0' });
  expect(posts[0].body.profile).toEqual(buildProfile({ ...morning, flowUp: false }, MORNING, false));
  expect(gateway.calls('PUT', /\/profiles\/profile%3Amorning\/visibility$/).map((call) => call.body)).toEqual([
    { visibility: 'hidden' },
  ]);
  await expect(pressed(page)).toHaveText('morning');
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);
  await expect(page.getByTestId('save')).toBeDisabled();
  // The save loaded the stored version: one PUT of the workflow, with the generator's profile.
  expect(loadedProfile(gateway, MORNING.title, MORNING.author)).toEqual({ ...morning, flowUp: false });
  expect(gateway.calls('PUT', '/api/v1/workflow')[0].body.profile).toEqual(posts[0].body.profile);
  // What is on the machine is what is on screen: back loads nothing more.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('an edit of the dose alone changes the notes of the same record', async ({ page }) => {
  const gateway = await withMorning(page);
  await openEditor(page);
  await expect(pressed(page)).toHaveText('morning');

  await page.getByTestId('mode-detail').click();
  await type(page, 'dose', '18');
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “morning” and loaded.');

  // The steps exist: the POST answers with the old record and its old notes, a PUT changes them.
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(1);
  const puts = gateway.calls('PUT', /\/profiles\/profile%3Amorning$/);
  expect(puts).toHaveLength(1);
  expect(puts[0].body.profile).toEqual(buildProfile({ ...morning, dose: 18 }, MORNING, false));
  expect(gateway.calls('PUT', /\/visibility$/)).toHaveLength(0);
  await expect(page.getByTestId('chip-value-dose')).toHaveText('18 g');
  expect(gateway.profiles.filter((record) => record.profile.title === MORNING.title)).toHaveLength(1);
  // The dose went to the workflow with the save.
  loadedProfile(gateway, MORNING.title, MORNING.author);
  expect(gateway.workflow.context.targetDoseWeight).toBe(18);
  expect(errors).toEqual([]);
});

test('simple mode: a changed value redraws the curve and back sends the generator\'s profile', async ({
  page,
}) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await expect(pressed(page)).toHaveText('light');
  const before = await pressurePoints(page);

  // A drag on the infuse pressure line, and the stop weight on its chip.
  const from = await page.locator('line.level[data-field="infusePressure"]').evaluate((line) => {
    const rect = line.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 + 10 };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 30, { steps: 4 });
  await page.mouse.move(from.x, from.y - 60, { steps: 4 });
  await page.mouse.up();
  const pressure = await number(page, 'value-infusePressure');
  expect(pressure).toBeGreaterThan(3);
  expect(await pressurePoints(page)).not.toBe(before);
  const chip = page.getByTestId('chip-graph-stopWeight');
  await chip.locator('.body').click();
  await chip.locator('[data-step="minus"]').click();
  await expect(chip).toContainText('47 g');

  // Back with changes: one PUT of the workflow with the values on screen, under the default's name.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const params = loadedProfile(gateway, 'A-Flow / default-light', 'Janek');
  expect(params).toEqual({ ...light, infusePressure: pressure, stopWeight: 47 });
  // Home shows what the workflow got; dose and stop weight are the workflow's, not on home.
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-light');
  expect(gateway.workflow.context).toMatchObject({ targetYield: 47, targetDoseWeight: 16 });
  // Nothing was saved by loading.
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  // The editor opens on the loaded values; back without a change sends nothing more.
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('chip-graph-stopWeight')).toContainText('47 g');
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('detail mode: typed values redraw the curve, are loaded by back, and are open again in the editor', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await page.getByTestId('mode-detail').click();
  const before = await pressurePoints(page);

  await page.getByTestId('phase-pressurize').click();
  await type(page, 'pourPressure', '8.5');
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  expect(await pressurePoints(page)).not.toBe(before);
  await page.getByTestId('phase-infuse').click();
  await type(page, 'infuseTemperature', '91');
  await type(page, 'dose', '18.5');

  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const params = loadedProfile(gateway, 'A-Flow / default-light', 'Janek');
  // The 2nd fill followed the infuse temperature and keeps the value it had (docs/a-flow-3.0.md, 5).
  expect(params).toEqual({ ...light, pourPressure: 8.5, infuseTemperature: 91, secondFillTemperature: 95, dose: 18.5 });
  expect(gateway.workflow.context.targetDoseWeight).toBe(18.5);

  // The loaded values were not saved; the editor opens on them again, under the default they came from.
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('value-pourPressure')).toHaveText('8.5 bar');
  await expect(pressed(page)).toHaveText('light');
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('chip-value-dose')).toHaveText('18.5 g');
  // A default is saved under a new name, not over itself.
  await expect(page.getByTestId('save')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('save as stores a new named profile, loads it, and it re-opens with the same parameters', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await page.getByTestId('toggle-second-fill').click();
  await page.getByTestId('mode-detail').click();
  await page.getByTestId('phase-infuse').click();
  await type(page, 'infuseTime', '25');

  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('morning light');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved as “morning light” and loaded.');

  const wanted: AFlowParams = { ...light, pauseDuration: 15, infuseTime: 25 };
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toEqual({
    profile: buildProfile(wanted, { title: 'A-Flow / morning light', author: 'Janek' }, false),
    metadata: { source: 'decaid-skin', aflow: '3.0' },
  });
  await expect(pressed(page)).toHaveText('morning light');
  await expect(page.getByTestId('save')).toBeDisabled();
  // The save loaded it: one PUT of the workflow, with the stored profile.
  expect(loadedProfile(gateway, 'A-Flow / morning light', 'Janek')).toEqual(wanted);

  // The same values under another name: Decaid keeps one profile for each set of steps.
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('evening');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toContainText('The profile was not saved');
  await expect(page.getByTestId('editor-notice')).toContainText('“A-Flow / morning light”');
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);

  // Loaded, it is the current profile, and back has nothing more to load.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / morning light');
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);
  // After a reload the editor opens on it.
  await page.getByTestId('open-editor').click();
  await page.reload();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(pressed(page)).toHaveText('morning light');
  await expect(page.getByTestId('value-infuseTime')).toHaveText('25 s');
  await expect(page.getByTestId('value-pauseDuration')).toHaveText('pause 15 s');
  await expect(page.getByTestId('toggle-second-fill')).toHaveAttribute('aria-pressed', 'true');

  // And the picker marks it as one of the skin's, with its dose, without showing the notes.
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-profiles').click();
  const item = page.getByTestId('profile-item').filter({ hasText: 'A-Flow / morning light' });
  await expect(item).toContainText('A-Flow 3.0');
  await expect(item).toContainText('loaded');
  await expect(page.getByTestId('profile-detail')).toContainText('16 g');
  await expect(page.getByTestId('profile-detail')).not.toContainText('aflow');
  expect(errors).toEqual([]);
});

test('the first-step workaround is off by default and adds the Pre Fill step when the setting is on', async ({
  page,
}) => {
  const gateway = (await mockGateway(page)).withDefaults('medium');
  await page.addInitScript(() =>
    localStorage.setItem('decaid-skin.settings', JSON.stringify({ firstStepWorkaround: true })),
  );
  await openEditor(page);
  await page.getByTestId('toggle-steps').click();
  await expect(page.getByTestId('steps').locator('tbody tr').first()).toContainText('Pre Fill');

  await page.getByTestId('toggle-flow').click();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  loadedProfile(gateway, 'A-Flow / default-medium', 'Janek', true);
  expect(gateway.calls('PUT', '/api/v1/workflow')[0].body.profile.steps[0].name).toBe('Pre Fill');

  // With the Pre Fill step it is still the same A-Flow 3.0 profile for the editor.
  await page.getByTestId('open-editor').click();
  await expect(pressed(page)).toHaveText('medium');
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('without the gateway the editor still edits, and says that nothing can be saved or loaded', async ({ page }) => {
  await mockGateway(page, { gateway: false });
  await openEditor(page);

  await expect(page.getByTestId('editor-notice')).toContainText('Decaid did not answer');
  await expect(pressed(page)).toHaveText('floral');
  await page.getByTestId('toggle-flow').click();
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);
  // A failed load on leaving is shown, and the editor stays open with the edit.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('editor-notice')).toContainText('The changes were not loaded');
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('toggle-flow')).toHaveText(/flow down/);
  // Back again leaves without loading: the user was told.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
});

test('the name in the top bar opens the picker: changes are loaded first, a choice there loads it and comes back', async ({
  page,
}) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  await openEditor(page);
  await expect(pressed(page)).toHaveText('light');

  // Unchanged: the shortcut loads nothing.
  await pressed(page).click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();

  // Changed: the values on screen go to the machine before the picker opens.
  await page.getByTestId('toggle-flow').click();
  await pressed(page).click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(loadedProfile(gateway, 'A-Flow / default-light', 'Janek')).toEqual({ ...light, flowUp: false });

  // An A-Flow 3.0 profile: the unsaved changes are asked about first (founder, 2026-10-14),
  // then it is loaded, and the editor is on it.
  await page.getByTestId('profile-item').filter({ hasText: 'A-Flow / default-dark' }).filter({ hasText: 'A-Flow 3.0' }).click();
  await page.getByTestId('unsaved-discard').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(pressed(page)).toHaveText('dark');
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(2);
  expect(puts[1].body.profile.title).toBe('A-Flow / default-dark');
  await expect(page.getByTestId('editor-notice')).toHaveCount(0);

  // Another profile: loaded, and home says why the editor did not open on it.
  await pressed(page).click();
  await page.getByTestId('profile-item').filter({ hasText: 'Best practice' }).click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('“Best practice” is loaded');
  await expect(page.getByTestId('notice')).toContainText('not an A-Flow 3.0 profile');
  await expect(page.getByTestId('profile-name')).toHaveText('Best practice');
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(3);
  expect(errors).toEqual([]);
});
