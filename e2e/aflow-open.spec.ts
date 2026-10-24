import { expect, test, type Page } from '@playwright/test';
import { readSteps, type AFlowParams } from '../src/aflow';
import plugin12 from '../src/aflow/fixtures/plugin-1.2.json' with { type: 'json' };
import rig14 from '../src/aflow/fixtures/rig-plugin-1.4.json' with { type: 'json' };
import type { Profile } from '../src/api';
import { buildProfile } from '../src/editor/save';
import { DEFAULT_SAVE_HINT } from '../src/editor/status';
import { paramsMetadata, splitNotes } from '../src/editor/storage';
import { mockGateway, record, type MockGateway } from './mock-gateway';
import { back } from './touch';

// Every A-Flow profile opens in the A-Flow 3.0 editor (spec 3.9 items 4 and 5, U2): the reader
// takes the values from the plugin's steps, ramp down is dropped and the status line says so,
// and 'save' stores it as a 3.0 profile with the old one as its parent, hidden. A profile whose
// A-Flow steps were changed elsewhere opens in the step editor with a line saying why.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The plugin 1.2 file of very-dark, ramp down on, saved by a user under a name of their own. */
const OLD: Profile = {
  ...(plugin12.find((p) => p.title === 'A-Flow / default-very-dark') as Profile),
  title: 'A-Flow / my very dark',
};

function readOld(): AFlowParams {
  const read = readSteps(OLD);
  if (!read.ok) throw new Error(read.reason);
  return read.params;
}

/** A gateway whose workflow holds this profile, loaded from its record as the picker does. */
async function withProfile(page: Page, profile: Profile, id: string): Promise<MockGateway> {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record(id, profile, { source: 'user' }));
  gateway.workflow.profile = profile;
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  return gateway;
}

test('an old A-Flow profile opens in the A-Flow editor, says ramp down is dropped, and save stores it as 3.0', async ({ page }) => {
  const gateway = await withProfile(page, OLD, 'profile:old');

  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('step-cards')).toHaveCount(0);
  await expect(page.getByTestId('editor-profile')).toHaveText('my very dark');
  await expect(page.getByTestId('editor-notice')).toHaveText(
    'An older A-Flow profile, read without ramp down, which 3.0 has not got; ‘save’ stores it as A-Flow 3.0.',
  );
  // The values the plugin wrote: the ramp of 3 + 3 s is one of 6 s.
  await expect(page.getByTestId('value-rampTime')).toHaveText('6 s');
  await expect(page.getByTestId('value-pourPressure')).toHaveText('10 bar');
  await expect(page.getByTestId('chip-graph-stopWeight')).toContainText('32 g');
  // Nothing edited, and still 'save' converts it.
  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “my very dark” and loaded.');

  const params = readOld();
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.parentId).toBe('profile:old');
  expect(posts[0].body.metadata).toEqual({ source: 'pureflow', ...paramsMetadata(params) });
  const about = { title: OLD.title, author: OLD.author, notes: OLD.notes };
  expect(posts[0].body.profile).toEqual(buildProfile(params, about, false));
  expect(posts[0].body.profile.steps.map((step: { name: string }) => step.name)).not.toContain('Pressure Decline');
  expect(posts[0].body.profile.notes).toBe(OLD.notes);
  expect(gateway.calls('PUT', /\/profiles\/profile%3Aold\/visibility$/).map((call) => call.body)).toEqual([{ visibility: 'hidden' }]);
  // The stored 3.0 version is on the machine, with its values in the workflow copy's notes.
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  expect(splitNotes(puts[0].body.profile.notes).params).toEqual(params);
  // Now it is a 3.0 profile: nothing to save until it is edited.
  await expect(page.getByTestId('save')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('leaving an old A-Flow profile without an edit loads nothing: the machine keeps it', async ({ page }) => {
  const gateway = await withProfile(page, OLD, 'profile:old');
  await expect(page.getByTestId('graph')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("Decaid's bundled A-Flow / default-medium opens as the skin's medium; save hints at save as", async ({ page }) => {
  const bundled = rig14.find((p) => p.title === 'A-Flow / default-medium') as Profile;
  const gateway = await withProfile(page, bundled, 'profile:bundled-medium');

  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('medium');
  await expect(page.getByTestId('start-medium')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('editor-notice')).toHaveText(
    'An older A-Flow profile, read without Pre Fill and the Pause without a 2nd fill, which 3.0 has not got; ‘save’ stores it as A-Flow 3.0.',
  );
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText(DEFAULT_SAVE_HINT);
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('an A-Flow profile whose steps were changed elsewhere opens in the step editor and says why', async ({ page }) => {
  const changed: Profile = {
    ...OLD,
    steps: OLD.steps.map((step) => (step.name === 'Fill' ? { ...step, limiter: { value: 7, range: 0.6 } } : step)),
  };
  await withProfile(page, changed, 'profile:changed');

  await expect(page.getByTestId('step-cards')).toBeVisible();
  await expect(page.getByTestId('graph')).toHaveCount(0);
  await expect(page.getByTestId('editor-notice')).toHaveText(
    'These A-Flow steps cannot be read as A-Flow 3.0 (“Fill” is not what A-Flow writes for its values), so they open in the step editor.',
  );
  expect(errors).toEqual([]);
});
