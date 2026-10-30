import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway, type MockGateway } from './mock-gateway';

// The step editor's SCRIPT tab, against
// a mocked gateway: a tap on a state word cycles it, a tap on a number opens the number pad,
// both change the preview and, saved, the stored steps; there is no text field.

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

const flowPath = (page: Page) => page.getByTestId('step-preview').getByTestId('shot-target-flow').getAttribute('d');

test('SCRIPT: a state word cycles, a number opens the pad, both move the preview and are saved', async ({ page }) => {
  const gateway = await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await page.getByTestId('tab-script').click();
  const script = page.getByTestId('step-script');
  await expect(page.getByTestId('script-step-5')).toBeVisible();
  await expect(page.getByTestId('step-preview')).toHaveAttribute('data-seconds', '81');

  // No text field: the steps are sentences of words, chips and numbers.
  await expect(script.locator('textarea, input')).toHaveCount(0);
  await expect(page.getByTestId('script-line-4-temperature')).toHaveText(/Maintain\s+Coffee\s+temperature\s+at\s+92\.0 °C/);
  await expect(page.getByTestId('script-line-4-pump')).toHaveText(/Flow quickly\s+at a rate of\s+2\.2 mL\/s/);
  await expect(page.getByTestId('script-line-4-limit')).toHaveText(/Limit to\s+8\.6 bar/);
  await expect(page.getByTestId('script-line-2-volumeStart')).toHaveText('Start tracking water volume');
  await expect(page.getByTestId('script-line-1-exit')).toHaveText(/Move on if\s+Pressure is over\s+4\.0 bar/);

  // A tap on a state word cycles it: step 4, the ramp, holds a pressure now.
  const before = await flowPath(page);
  await page.getByTestId('script-chip-3-pump').click();
  await expect(page.getByTestId('script-chip-3-pump')).toHaveText('Pressure quickly');
  await expect(page.getByTestId('script-line-3-pump')).toHaveText(/Pressure quickly\s+to\s+4\.0 bar/);
  await expect.poll(() => flowPath(page)).not.toBe(before);
  // The exit cycles too, through off, and back round to where it was.
  for (const next of ['Pressure is under', 'Flow is over', 'Flow is under', 'off', 'Pressure is over']) {
    await page.getByTestId('script-chip-1-exit').click();
    await expect(page.getByTestId('script-chip-1-exit')).toHaveText(next);
  }
  await expect(page.getByTestId('script-line-1-exit')).toHaveText(/Move on if\s+Pressure is over\s+4\.0 bar/);

  // A tap on a number opens the pad: step 5's flow to 3.0 ml/s.
  const cycled = await flowPath(page);
  await page.getByTestId('script-value-4-target').click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of ['3', 'dot', '0']) await page.getByTestId(`numpad-key-${key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
  await expect(page.getByTestId('script-value-4-target')).toHaveText('3.0 mL/s');
  await expect.poll(() => flowPath(page)).not.toBe(cycled);
  await page.screenshot({ path: 'docs/product/step-script.png' });

  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “My blooming” and loaded.');
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.parentId).toBe('profile:mine');
  const steps = MINE.steps.map((step, i) =>
    i === 3 ? { ...step, pump: 'pressure', transition: 'fast' } : i === 4 ? { ...step, flow: 3 } : step,
  );
  expect(posts[0].body.profile).toEqual({ ...MINE, steps });
  const stored = gateway.profiles.find((record) => record.parentId === 'profile:mine')!;
  expect(stored.profile.steps).toEqual(steps);
  expect(gateway.workflow.profile.steps).toEqual(steps);

  // The cards show the same steps.
  await page.getByTestId('tab-cards').click();
  await page.getByTestId('step-card-4').click();
  await expect(page.getByTestId('chip-value-4-target')).toHaveText('3.0 ml/s');
  await page.getByTestId('step-card-3').click();
  await expect(page.getByTestId('cycle-value-3-pump')).toHaveText('Pressure quickly');
  expect(errors).toEqual([]);
});

test('SCRIPT: the sensor cycles; an exit, limit and maximum set off stay muted lines, are saved off and switch on again', async ({
  page,
}) => {
  const gateway = await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await page.getByTestId('tab-script').click();
  const preview = page.getByTestId('step-preview');
  await expect(preview).toHaveAttribute('data-seconds', '81');
  await expect(preview.getByTestId('shot-border')).toHaveCount(5);

  await page.getByTestId('script-chip-0-sensor').click();
  await expect(page.getByTestId('script-chip-0-sensor')).toHaveText('Water');
  await page.getByTestId('script-chip-0-sensor').click();
  await expect(page.getByTestId('script-chip-0-sensor')).toHaveText('Coffee');

  const pad = async (testid: string, keys: string) => {
    await page.getByTestId(testid).click();
    for (const key of keys) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
    await page.getByTestId('numpad-confirm').click();
  };
  const line = (index: number, kind: string) => page.getByTestId(`script-line-${index}-${kind}`);

  // Step 2, "Preinfusion": its exit cycled to off; the line stays, muted, without its value.
  for (let n = 0; n < 4; n++) await page.getByTestId('script-chip-1-exit').click();
  await expect(line(1, 'exit')).toHaveText(/Move on:\s+off/);
  await expect(line(1, 'exit')).toHaveAttribute('data-off', 'true');
  await expect(page.getByTestId('script-value-1-exit')).toHaveCount(0);
  // Its time and volume typed 0: no maximum, the amounts muted in their places; the step is 0 s now and not drawn.
  await pad('script-value-1-seconds', '0');
  await pad('script-value-1-volume', '0');
  await expect(line(1, 'maximum')).toHaveText(/No maximum\s+weight off\s+or\s+time off\s+or\s+volume off/);
  await expect(line(1, 'maximum')).toHaveAttribute('data-off', 'true');
  await expect(page.getByTestId('script-value-1-seconds')).toHaveAttribute('data-off', 'true');
  await expect(preview).toHaveAttribute('data-seconds', '58');
  await expect(preview.getByTestId('shot-border')).toHaveCount(4);
  await expect(page.getByTestId('script-step-1')).toBeVisible();
  // Step 5's limit typed 0: 'No limit', with the chip that switches it on.
  await pad('script-value-4-limiter', '0');
  await expect(line(4, 'limit')).toHaveText(/No limit\s+switch on/);
  await expect(line(4, 'limit')).toHaveAttribute('data-off', 'true');
  // Switched on, it has its 8.6 bar back; typed 0 again for the save.
  await page.getByTestId('script-chip-4-limit').click();
  await expect(line(4, 'limit')).toHaveText(/Limit to\s+8\.6 bar/);
  await pad('script-value-4-limiter', '0');
  await expect(line(4, 'limit')).toHaveText(/No limit\s+switch on/);
  await page.screenshot({ path: 'docs/product/step-script-off.png' });

  // Saved: what Decaid stores for no exit and no limit.
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “My blooming” and loaded.');
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  const steps = MINE.steps.map((step, i) =>
    i === 1 ? { ...step, exit: null, seconds: 0, volume: 0 } : i === 4 ? { ...step, limiter: null } : step,
  );
  expect(posts[0].body.profile).toEqual({ ...MINE, steps });

  // On again after the save, which reopens the stored profile: the limit and the exit take 9 bar, a time is typed on the muted pill.
  await page.getByTestId('script-chip-4-limit').click();
  await expect(line(4, 'limit')).toHaveText(/Limit to\s+9\.0 bar/);
  await expect(line(4, 'limit')).toHaveAttribute('data-off', 'false');
  await page.getByTestId('script-chip-1-exit').click();
  await expect(line(1, 'exit')).toHaveText(/Move on if\s+Pressure is over\s+9\.0 bar/);
  await pad('script-value-1-seconds', '23');
  await expect(line(1, 'maximum')).toHaveText(/For a maximum of\s+weight off\s+or\s+23\.0 sec\s+or\s+volume off/);
  await expect(preview).toHaveAttribute('data-seconds', '81');
  // The cards show the same: the exit and the limit live again.
  await page.getByTestId('tab-cards').click();
  await page.getByTestId('step-card-4').click();
  await expect(page.getByTestId('chip-value-4-limiter')).toHaveText('9.0 bar');
  expect(errors).toEqual([]);
});
