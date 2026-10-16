import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { writeScript } from '../src/steps/script';
import { mockGateway, type MockGateway } from './mock-gateway';

// The step editor's SCRIPT tab (spec 3.6, acceptance 13, research.md 17.8), against a mocked
// gateway: a value changed in the text changes the preview and, saved, the stored step; a text
// that does not parse shows its error with its line, and nothing is saved or loaded.

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
const SCRIPT = writeScript(MINE);
/** step 5, "flat flow": line 21 of the text */
const FLAT_FLOW = '- Flow quickly at a rate of 2.2 mL/s\n- Limit to 8.6 bar';

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

async function openScript(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await page.getByTestId('tab-script').click();
  await expect(page.getByTestId('script-text')).toHaveValue(SCRIPT);
}

const flowPath = (page: Page) => page.getByTestId('step-preview').getByTestId('shot-target-flow').getAttribute('d');

test('a value changed in the text changes the preview and, saved, the stored step', async ({ page }) => {
  const gateway = await withMine(page);
  await openScript(page);
  await expect(page.getByTestId('step-preview')).toHaveAttribute('data-seconds', '81');
  const before = await flowPath(page);

  await page.getByTestId('script-text').fill(SCRIPT.replace(FLAT_FLOW, FLAT_FLOW.replace('2.2', '3.0')));
  await expect.poll(() => flowPath(page)).not.toBe(before);
  await expect(page.getByTestId('script-errors')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/step-script.png' });

  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('editor-notice')).toHaveText('Saved “My blooming” and loaded.');
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.parentId).toBe('profile:mine');
  const steps = MINE.steps.map((step, i) => (i === 4 ? { ...step, flow: 3 } : step));
  expect(posts[0].body.profile).toEqual({ ...MINE, steps });
  const stored = gateway.profiles.find((record) => record.parentId === 'profile:mine')!;
  expect(stored.profile.steps).toEqual(steps);
  expect(gateway.workflow.profile.steps).toEqual(steps);

  // The cards show the same steps.
  await page.getByTestId('tab-cards').click();
  await page.getByTestId('step-card-4').click();
  await expect(page.getByTestId('chip-value-4-target')).toHaveText('3.0 ml/s');
  expect(errors).toEqual([]);
});

test('a text that does not parse shows its error with the line, and nothing is saved', async ({ page }) => {
  const gateway = await withMine(page);
  await openScript(page);
  const text = page.getByTestId('script-text');

  // A change that parses first: the cards will show it.
  await text.fill(SCRIPT.replace(FLAT_FLOW, FLAT_FLOW.replace('2.2', '3.0')));
  await expect(page.getByTestId('save')).toBeEnabled();
  const parsed = await flowPath(page);

  // Then a sentence the parser does not know, and a value out of range.
  await text.fill(SCRIPT.replace(FLAT_FLOW, '- Flow fast at 3.0 mL/s\n- Limit to 8.6 bar').replace('2.0 sec or 500.0 ml', '200.0 sec or 500.0 ml'));
  await expect(page.getByTestId('script-errors')).toContainText('The script has errors: nothing is saved.');
  await expect(page.getByTestId('script-error')).toHaveText([
    "line 21: not understood: '- Flow fast at 3.0 mL/s'",
    'line 4: time is 0 to 127 sec',
    'step 5 has no pump sentence',
  ]);
  // The preview keeps the text that last parsed.
  expect(await flowPath(page)).toBe(parsed);
  await expect(page.getByTestId('save')).toBeDisabled();
  await expect(page.getByTestId('save-as')).toBeDisabled();
  await page.getByTestId('save').click({ force: true });

  // Leaving is refused too: nothing is loaded.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('editor-notice')).toContainText('The script has errors: nothing is saved or loaded.');
  await expect(page.getByTestId('script-text')).toBeVisible();
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  expect(gateway.calls('PUT', /^\/api\/v1\/profiles\//)).toHaveLength(0);
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  expect(gateway.profiles.find((record) => record.id === 'profile:mine')!.profile).toEqual(MINE);

  // Back on the cards: the steps that last parsed, and the broken text is gone.
  await page.getByTestId('tab-cards').click();
  await expect(page.getByTestId('step-preview')).toBeVisible();
  await page.getByTestId('step-card-4').click();
  await expect(page.getByTestId('chip-value-4-target')).toHaveText('3.0 ml/s');
  await page.getByTestId('tab-script').click();
  await expect(text).toHaveValue(SCRIPT.replace(FLAT_FLOW, FLAT_FLOW.replace('2.2', '3.0')));
  await expect(page.getByTestId('script-errors')).toHaveCount(0);
  await expect(page.getByTestId('save')).toBeEnabled();
  expect(errors).toEqual([]);
});
