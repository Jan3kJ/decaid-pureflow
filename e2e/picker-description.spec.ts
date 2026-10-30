import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_NOTES, DEFAULT_PROFILES, readSteps } from '../src/aflow';
import { describeAFlow } from '../src/aflow/describe';
import rig14 from '../src/aflow/fixtures/rig-plugin-1.4.json' with { type: 'json' };
import type { Profile } from '../src/api';
import { buildProfile } from '../src/editor/save';
import { paramsMetadata } from '../src/editor/storage';
import { mockGateway, record } from './mock-gateway';

// The picker shows a text made from an A-Flow profile's values: after the
// notes the user wrote, alone where the notes are empty or the old plugin's stock sentence. A
// profile that is not A-Flow shows its notes alone. The text is never written to the profile.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const dark = DEFAULT_PROFILES.find((entry) => entry.id === 'default-dark')!;
/** The plugin 1.4 file of the rig, under a name of its own, with the plugin's stock sentence. */
const PLUGIN: Profile = {
  ...(rig14.find((p) => p.title === 'A-Flow / default-medium') as Profile),
  title: 'A-Flow / my medium',
  notes: DEFAULT_NOTES,
};
const MINE = buildProfile(dark.params, { title: 'A-Flow / my dark', author: 'Me', notes: 'Grind two clicks finer.' }, false);

async function select(page: Page, title: string) {
  await page.getByTestId('profile-item').filter({ hasText: title }).first().click();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText(title);
  return page.getByTestId('profile-description');
}

test('an A-Flow profile shows the text made from its values after its own notes, a D-Flow one its notes alone', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:plugin', PLUGIN, { source: 'bundled' }));
  gateway.profiles.push(record('profile:mine', MINE, { source: 'pureflow', ...paramsMetadata(dark.params) }));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();

  // One of the skin's defaults: no notes, the text alone.
  const medium = DEFAULT_PROFILES.find((entry) => entry.id === 'default-medium')!;
  const description = await select(page, medium.title);
  await expect(description).toHaveText(describeAFlow(medium.params));
  await expect(description).toContainText('16 g in, 42 g out, a ratio of 1:2.6. Fills at 8 ml/s until 3 bar or 15 s, at 93 °C.');

  // The plugin's profile: its stock sentence counts as nothing written; its dose is not its own.
  const read = readSteps(PLUGIN);
  if (!read.ok) throw new Error(read.reason);
  await select(page, PLUGIN.title);
  await expect(description).toHaveText(describeAFlow(read.params, { dose: false }));
  await expect(description).not.toContainText(DEFAULT_NOTES);

  // A stored 3.0 profile: the user's notes first, then a blank line and the text.
  await select(page, MINE.title);
  expect(await description.innerText()).toBe(`Grind two clicks finer.\n\n${describeAFlow(dark.params)}`);

  await page.screenshot({ path: 'docs/product/profile-picker-description.png' });

  // D-Flow: the notes alone.
  await select(page, 'D-Flow / default');
  await expect(description).toHaveText('D-Flow / default: a profile of the mocked gateway');

  // Showing it wrote nothing to Decaid.
  expect(gateway.profiles.find((entry) => entry.id === 'profile:mine')!.profile.notes).toBe('Grind two clicks finer.');
  expect(gateway.profiles.find((entry) => entry.id === 'profile:plugin')!.profile.notes).toBe(DEFAULT_NOTES);
  expect(errors).toEqual([]);
});
