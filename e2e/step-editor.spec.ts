import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import { insertStepAfter, moveStep, removeStepAt, setValue, stepValue } from '../src/steps/model';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway, type MockGateway } from './mock-gateway';

// The step editor (spec 3.6, acceptance 10, research.md 17.11), against a mocked gateway:
// every profile that is not A-Flow 3.0 opens in it; a value changed with ± and with the pad,
// a step added, one deleted and one moved, then 'save', give a stored profile whose steps
// equal the edit, with its parent for Decaid's lineage.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const BLOOMING = blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile;
const MINE: Profile = { ...structuredClone(BLOOMING), title: 'My blooming', author: 'Janek' };

/** A gateway that holds 'My blooming', the user's own copy of Blooming Espresso, as a stored profile and as the workflow's. */
async function withMine(page: Page): Promise<MockGateway> {
  const gateway = await mockGateway(page);
  gateway.profiles.push({
    id: 'profile:mine',
    profile: structuredClone(MINE),
    metadataHash: 'm',
    compoundHash: 'c',
    parentId: null,
    visibility: 'visible',
    isDefault: false,
    createdAt: '2026-10-16T04:00:00Z',
    updatedAt: '2026-10-16T04:00:00Z',
    metadata: { source: 'other-app' },
  });
  gateway.workflow.profile = structuredClone(MINE);
  return gateway;
}

const card = (page: Page, index: number) => page.getByTestId(`step-card-${index}`);

/**
 * Where the open card sits in the row: its centre's distance from the row's centre, and how far
 * the row is scrolled and can scroll, in CSS pixels.
 */
function placement(page: Page) {
  return page.getByTestId('step-cards').evaluate((row) => {
    const card = row.querySelector('[data-open="true"]')!.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    return {
      offCentre: Math.round(card.left + card.width / 2 - (box.left + box.width / 2)),
      scroll: Math.round(row.scrollLeft),
      most: row.scrollWidth - row.clientWidth,
    };
  });
}

/**
 * The open card is as near the row's centre as the row can scroll once the scroll has run:
 * 'centre' on it exactly, 'start' and 'end' with the row at that end.
 */
async function centred(page: Page, where: 'centre' | 'start' | 'end' | 'near' = 'centre') {
  await expect
    .poll(async () => {
      const { offCentre, scroll, most } = await placement(page);
      const nearest = Math.min(most, Math.max(0, scroll + offCentre));
      if (Math.abs(scroll - nearest) > 1) return false;
      if (where === 'start') return scroll === 0;
      if (where === 'end') return Math.abs(scroll - most) <= 1;
      return where === 'near' || Math.abs(offCentre) <= 1;
    })
    .toBe(true);
}

async function type(page: Page, testid: string, keys: string) {
  await page.getByTestId(`chip-edit-${testid}`).click();
  for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
}

/** The edits of acceptance 10, on screen; the same edits, with the model, give what must be stored. */
async function editOnScreen(page: Page): Promise<Profile> {
  let expected: Profile = structuredClone(MINE);
  // A value with ±: step 1's temperature, 97.5 → 98.0 °C.
  await page.getByTestId('chip-0-temperature').locator('[data-step="plus"]').click();
  expected = stepValue(expected, 0, 'temperature', 1);
  await expect(page.getByTestId('chip-value-0-temperature')).toHaveText('98.0 °C');
  // A value with the pad: step 2's flow, 4.0 → 3.5 ml/s.
  await card(page, 1).click();
  await type(page, '1-target', '3.5');
  expected = setValue(expected, 1, 'target', 3.5);
  await expect(page.getByTestId('chip-value-1-target')).toHaveText('3.5 ml/s');
  // A step added after step 2: a copy of it, named "New Step", open.
  await page.getByTestId('step-insert-1').click();
  expected = insertStepAfter(expected, 1);
  await expect(card(page, 2)).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('step-name-2')).toHaveValue('New Step');
  await expect(page.getByTestId('step-count')).toHaveText('7 steps');
  // Step 1 deleted, after the question.
  await card(page, 0).click();
  await page.getByTestId('step-delete-0').click();
  await expect(page.getByTestId('delete-dialog')).toContainText('Delete step 1?');
  await page.getByTestId('delete-confirm').click();
  expected = removeStepAt(expected, 0);
  await expect(page.getByTestId('step-count')).toHaveText('6 steps');
  // Step 4 ("ramp") moved left: it is step 3 now, and still open.
  await card(page, 3).click();
  await page.getByTestId('step-move-left-3').click();
  expected = moveStep(expected, 3, 2);
  await expect(card(page, 2)).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('step-name-2')).toHaveValue('ramp');
  await centred(page);
  return expected;
}

test('a profile that is not A-Flow 3.0 opens in the step editor; edits saved give its steps, with the parent', async ({
  page,
}) => {
  const gateway = await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();

  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('graph')).toHaveCount(0);
  await expect(page.getByTestId('editor-profile')).toHaveText('My blooming');
  await expect(page.getByTestId('step-count')).toHaveText('6 steps');
  await expect(card(page, 0)).toHaveAttribute('data-open', 'true');
  await expect(card(page, 1)).toContainText('preinfusion');
  // Nothing changed yet: nothing to save.
  await expect(page.getByTestId('save')).toBeDisabled();

  const expected = await editOnScreen(page);
  await page.screenshot({ path: 'docs/product/step-editor.png' });

  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “My blooming” and loaded.');

  // The stored profile's steps equal the edit; Decaid's lineage: the parent named, and hidden.
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.parentId).toBe('profile:mine');
  expect(posts[0].body.metadata).toEqual({ source: 'pureflow' });
  expect(posts[0].body.profile).toEqual(expected);
  const stored = gateway.profiles.find((record) => record.parentId === 'profile:mine')!;
  expect(stored.profile.steps).toEqual(expected.steps);
  expect(stored.profile.target_volume_count_start).toBe(expected.target_volume_count_start);
  expect(gateway.calls('PUT', /\/profiles\/profile%3Amine\/visibility$/).map((call) => call.body)).toEqual([
    { visibility: 'hidden' },
  ]);
  // The save loaded what it stored; back loads nothing more.
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  expect(puts[0].body.profile).toEqual(expected);
  await expect(page.getByTestId('save')).toBeDisabled();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('cards have no arrow buttons: a tap selects a card and centres it, the first and last as near as they go; moving still works', async ({
  page,
}) => {
  await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await expect(card(page, 0)).toHaveAttribute('data-open', 'true');
  // No arrows in the card: its header is the number and the name; moving is in the footer, as text.
  await expect(card(page, 0).locator('header button')).toHaveCount(0);
  await expect(card(page, 0).locator('svg')).toHaveCount(0);
  await expect(card(page, 0).locator('footer').getByTestId('step-move-right-0')).toHaveText('move right');
  await expect(page.getByTestId('step-move-left-0')).toBeDisabled();
  await centred(page, 'start');

  // A tap on a closed card selects it and centres it.
  await card(page, 2).click();
  await expect(card(page, 2)).toHaveAttribute('data-open', 'true');
  await expect(card(page, 0)).toHaveAttribute('data-open', 'false');
  await centred(page);
  await card(page, 3).click();
  await centred(page);
  // The last card goes as far as the row scrolls, then the first back to the start.
  await card(page, 5).click();
  await expect(page.getByTestId('step-move-right-5')).toBeDisabled();
  await centred(page, 'end');
  await card(page, 0).click();
  await centred(page, 'start');

  // Moving: the moved step stays selected and centred in its new place.
  await card(page, 3).click();
  await expect(page.getByTestId('step-name-3')).toHaveValue('ramp');
  await page.getByTestId('step-move-right-3').click();
  await expect(card(page, 4)).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('step-name-4')).toHaveValue('ramp');
  await centred(page, 'near');
  await page.getByTestId('step-move-left-4').click();
  await page.getByTestId('step-move-left-3').click();
  await expect(page.getByTestId('step-name-2')).toHaveValue('ramp');
  await centred(page);
  expect(errors).toEqual([]);
});

test('an A-Flow 3.0 profile opens in the A-Flow editor, also from the picker of the step editor', async ({ page }) => {
  const gateway = (await withMine(page)).withDefaults();
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();

  await page.getByTestId('editor-profile').click();
  await page.getByTestId('profile-item').filter({ hasText: 'A-Flow / default-dark' }).filter({ hasText: 'A-Flow 3.0' }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('step-cards')).toHaveCount(0);
  await expect(page.getByTestId('editor-profile')).toHaveText('dark');

  // And back to a profile of steps: the step editor again.
  await page.getByTestId('editor-profile').click();
  await page.getByTestId('profile-item').filter({ hasText: 'D-Flow / default' }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('D-Flow / default');
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('leaving loads the changed steps; the warning comes before another load, and its save as keeps the parent', async ({
  page,
}) => {
  const gateway = await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await page.getByTestId('cycle-0-pump').click();
  await expect(page.getByTestId('cycle-value-0-pump')).toHaveText('Flow slowly');
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  expect(puts[0].body.profile.steps[0].transition).toBe('smooth');
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);

  // Another load: asked first; cancel loads nothing.
  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').filter({ hasText: 'Best practice' }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('unsaved-dialog')).toBeVisible();
  await expect(page.getByTestId('unsaved-name')).toHaveText('My blooming');
  await page.getByTestId('unsaved-cancel').click();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(1);

  // 'Save as…' opens the step editor on the machine's steps and asks for a name.
  await page.getByTestId('profile-item').filter({ hasText: 'Best practice' }).click();
  await page.getByTestId('load-profile').click();
  await page.getByTestId('unsaved-save-as').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-name').fill('Slow start');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved as “Slow start” and loaded.');
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.parentId).toBe('profile:mine');
  expect(posts[0].body.profile.title).toBe('Slow start');
  expect(posts[0].body.profile.steps[0].transition).toBe('smooth');
  // The source stays visible: nothing hidden.
  expect(gateway.calls('PUT', /\/visibility$/)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("a bundled default is saved under a new name only, with the default as its parent", async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = gateway.profiles[0].profile;
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('editor-profile')).toHaveText('Best practice');
  await page.getByTestId('chip-0-seconds').locator('[data-step="minus"]').click();
  await expect(page.getByTestId('chip-value-0-seconds')).toHaveText('10 s');
  await expect(page.getByTestId('save')).toBeDisabled();
  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('Best practice');
  await expect(page.getByTestId('save-hint')).toHaveText('This name is in use.');
  await expect(page.getByTestId('save-confirm')).toBeDisabled();
  await page.getByTestId('save-name').fill('Best, shorter');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved as “Best, shorter” and loaded.');
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts.map((call) => [call.body.parentId, call.body.profile.title, call.body.profile.steps[0].seconds])).toEqual([
    ['profile:best', 'Best, shorter', 10],
  ]);
  // Saved: 'save' continues the new profile now.
  await page.getByTestId('chip-0-seconds').locator('[data-step="minus"]').click();
  await expect(page.getByTestId('save')).toBeEnabled();
  expect(errors).toEqual([]);
});
