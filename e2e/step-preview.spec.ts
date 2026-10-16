import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway, type MockGateway } from './mock-gateway';

// The step editor's curve preview and the profile's settings (spec 3.6, acceptance 11,
// research.md 17.11 E3), against a mocked gateway: every kind of step edit changes the
// preview's paths; title, notes, target weight, target volume and tank temperature edited in
// SETTINGS are in the stored profile, also when only the title or the notes changed.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const BLOOMING = blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile;
const MINE: Profile = { ...structuredClone(BLOOMING), title: 'My blooming' };

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
    metadata: null,
  });
  gateway.workflow.profile = structuredClone(MINE);
  return gateway;
}

/** What the preview draws: its three paths and its step borders. */
async function drawn(page: Page) {
  const preview = page.getByTestId('step-preview');
  const d = async (testid: string) => (await preview.getByTestId(testid).getAttribute('d')) ?? '';
  return {
    pressure: await d('shot-target-pressure'),
    flow: await d('shot-target-flow'),
    temperature: await d('shot-target-temperature'),
    borders: await preview.getByTestId('shot-border').count(),
    seconds: await preview.getAttribute('data-seconds'),
  };
}

async function changes(page: Page, action: () => Promise<void>) {
  const before = await drawn(page);
  await action();
  await expect.poll(() => drawn(page)).not.toEqual(before);
}

test('the curve preview draws the steps and changes with each kind of step edit', async ({ page }) => {
  await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  const preview = page.getByTestId('step-preview');
  await expect(preview).toBeVisible();
  // Blooming Espresso: six flow steps, 2 + 23 + 30 + 5 + 20 + 1 s.
  await expect(preview).toHaveAttribute('data-seconds', '81');
  await expect(preview.getByTestId('shot-border')).toHaveCount(5);
  expect((await drawn(page)).flow).toMatch(/^M/);
  expect((await drawn(page)).pressure).toBe('');

  // A value with ±, and one with the pad.
  await changes(page, () => page.getByTestId('chip-0-temperature').locator('[data-step="plus"]').click());
  await changes(page, async () => {
    await page.getByTestId('chip-edit-0-target').click();
    for (const key of '6') await page.getByTestId(`numpad-key-${key}`).click();
    await page.getByTestId('numpad-confirm').click();
  });
  // A step's time.
  await changes(page, () => page.getByTestId('chip-0-seconds').locator('[data-step="plus"]').click());
  // A pump switch: flow quickly → flow slowly → pressure quickly; the pressure is drawn now.
  await changes(page, () => page.getByTestId('cycle-0-pump').click());
  await changes(page, () => page.getByTestId('cycle-0-pump').click());
  expect((await drawn(page)).pressure).toMatch(/^M/);
  // Add, move, delete.
  await changes(page, () => page.getByTestId('step-insert-0').click());
  await expect(preview.getByTestId('shot-border')).toHaveCount(6);
  // The copy and the step it was made from look alike: move the next one, which differs.
  await page.getByTestId('step-card-2').click();
  await changes(page, () => page.getByTestId('step-move-left-2').click());
  await changes(page, async () => {
    await page.getByTestId('step-delete-1').click();
    await page.getByTestId('delete-confirm').click();
  });
  await expect(preview.getByTestId('shot-border')).toHaveCount(5);

  // A step without a time is drawn 10 s long and shaded.
  await expect(preview.getByTestId('shot-shaded')).toHaveCount(0);
  await page.getByTestId('step-card-0').click();
  await page.getByTestId('chip-edit-0-seconds').click();
  await page.getByTestId('numpad-key-0').click();
  await page.getByTestId('numpad-confirm').click();
  await expect(preview.getByTestId('shot-shaded')).toHaveCount(1);
  await expect(page.getByTestId('preview-untimed')).toBeVisible();
  expect(errors).toEqual([]);
});

test('title, notes, target weight, target volume and tank temperature are saved with the profile', async ({ page }) => {
  const gateway = await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('profile-settings')).toBeVisible();
  await expect(page.getByTestId('step-cards')).toHaveCount(0);
  await expect(page.getByTestId('setting-title')).toHaveValue('My blooming');

  await page.getByTestId('setting-title').fill('Blooming, 40 g');
  await page.getByTestId('setting-notes').fill('A longer bloom.');
  await page.getByTestId('chip-edit-setting-target_weight').click();
  for (const key of '40') await page.getByTestId(`numpad-key-${key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('chip-value-setting-target_weight')).toHaveText('40.0 g');
  await page.getByTestId('chip-edit-setting-target_volume').click();
  for (const key of '60') await page.getByTestId(`numpad-key-${key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await page.getByTestId('chip-edit-setting-tank_temperature').click();
  for (const key of '34') await page.getByTestId(`numpad-key-${key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await page.getByTestId('chip-setting-tank_temperature').locator('[data-step="plus"]').click();
  await expect(page.getByTestId('chip-value-setting-tank_temperature')).toHaveText('35 °C');
  await page.screenshot({ path: 'docs/product/step-settings.png' });

  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “Blooming, 40 g” and loaded.');
  await expect(page.getByTestId('editor-profile')).toHaveText('Blooming, 40 g');
  const wanted = { title: 'Blooming, 40 g', notes: 'A longer bloom.', target_weight: 40, target_volume: 60, tank_temperature: 35 };
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.parentId).toBe('profile:mine');
  expect(posts[0].body.profile).toEqual({ ...MINE, ...wanted });
  const stored = gateway.profiles.find((record) => record.parentId === 'profile:mine')!;
  expect(stored.profile).toMatchObject(wanted);
  expect(errors).toEqual([]);
});

test('a change of the title or of the notes alone is saved too, and a title in use is refused', async ({ page }) => {
  const gateway = await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await page.getByTestId('tab-settings').click();

  // The title of another visible profile: 'save' is off and says why.
  await page.getByTestId('setting-title').fill('Best practice');
  await expect(page.getByTestId('setting-title-problem')).toContainText('Another profile is called “Best practice”');
  await expect(page.getByTestId('save')).toBeDisabled();
  // An empty title is not taken: the profile keeps its own.
  await page.getByTestId('setting-title').fill('');
  await expect(page.getByTestId('setting-title-problem')).toContainText('A profile needs a title');
  await expect(page.getByTestId('editor-profile')).toHaveText('Best practice');

  // Only the title.
  await page.getByTestId('setting-title').fill('Bloom only');
  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “Bloom only” and loaded.');
  let record = gateway.profiles.find((entry) => entry.id === 'profile:mine')!;
  expect(record.profile.title).toBe('Bloom only');
  expect(record.visibility).toBe('visible');
  expect(gateway.calls('PUT', '/api/v1/profiles/profile%3Amine').at(-1)!.body.profile.title).toBe('Bloom only');

  // Only the notes.
  await page.getByTestId('setting-notes').fill('Notes, nothing else.');
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “Bloom only” and loaded.');
  record = gateway.profiles.find((entry) => entry.id === 'profile:mine')!;
  expect(record.profile.notes).toBe('Notes, nothing else.');
  expect(record.profile.steps).toEqual(MINE.steps);
  expect(errors).toEqual([]);
});
