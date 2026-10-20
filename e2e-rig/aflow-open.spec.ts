import { expect, test } from '@playwright/test';
import type { MachineSnapshot, ProfileRecord } from '../src/api';
import { readSteps } from '../src/aflow';
import type { RigWorkflow } from './gateway';

// One of Decaid's own A-Flow profiles opens in the A-Flow 3.0 editor (spec 3.9, U2, acceptance
// item 43), against the rig: Decaid's bundled 'A-Flow / default-very-dark', the plugin's 1.4
// file with ramp down on. The picker loads it as it is; the editor reads its steps, names what
// it drops in the status line and offers 'save', which the test does not press. Leaving without
// an edit loads nothing. The test stores nothing and puts the workflow back as it was.

const GATEWAY = 'http://localhost:8080';
const TITLE = 'A-Flow / default-very-dark';

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

const profiles = (): Promise<ProfileRecord[]> => api<ProfileRecord[]>('GET', '/api/v1/profiles?includeHidden=true');
const summary = (records: ProfileRecord[]) => records.map((record) => `${record.id} ${record.visibility}`).sort();

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test("Decaid's A-Flow / default-very-dark opens in the A-Flow editor, read from its steps, without a save", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const before = await profiles();
  const bundled = before.find((record) => record.profile.title === TITLE && record.visibility === 'visible');
  if (!bundled) throw new Error(`the rig holds no ${TITLE}`);
  const read = readSteps(bundled.profile);
  if (!read.ok) throw new Error(`the reader cannot read the rig's ${TITLE}: ${read.reason}`);
  console.log(`rig ${TITLE}: ${bundled.profile.steps.length} steps, read as ${JSON.stringify(read)}`);
  expect(read.dropped).toContain('rampDown');

  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(GATEWAY) && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  try {
    await page.goto('/');
    await page.getByTestId('open-profiles').click();
    const items = page.getByTestId('profile-item');
    await items.filter({ hasText: TITLE }).click({ timeout: 15_000 });
    await page.getByTestId('load-profile').click();
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText(TITLE);

    await page.getByTestId('open-editor').click();
    await expect(page.getByTestId('graph')).toBeVisible();
    await expect(page.getByTestId('step-cards')).toHaveCount(0);
    await expect(page.getByTestId('editor-profile')).toHaveText('default-very-dark', { timeout: 15_000 });
    await expect(page.getByTestId('editor-notice')).toContainText('ramp down');
    await expect(page.getByTestId('editor-notice')).toContainText('‘save’ stores it as A-Flow 3.0');
    // The plugin's ramp up and ramp down, 3 s each, are one ramp of 6 s.
    await expect(page.getByTestId('value-rampTime')).toHaveText(`${read.params.rampTime} s`);
    await expect(page.getByTestId('chip-graph-stopWeight')).toContainText(`${read.params.stopWeight} g`);
    await expect(page.getByTestId('save')).toBeEnabled();

    // Back without an edit: nothing is loaded, and nothing was stored.
    const loads = sent.length;
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('screen-home')).toBeVisible();
    expect(sent.slice(loads)).toEqual([]);
    expect(sent.filter((call) => call.startsWith('POST /api/v1/profiles'))).toEqual([]);
    const workflow = await api<RigWorkflow>('GET', '/api/v1/workflow');
    expect(workflow.profile.steps).toEqual(bundled.profile.steps);
  } finally {
    await api('PUT', '/api/v1/workflow', {
      profile: workflowBefore.profile,
      context: {
        targetYield: workflowBefore.context?.targetYield ?? 0,
        targetDoseWeight: workflowBefore.context?.targetDoseWeight ?? null,
      },
    });
  }

  expect(summary(await profiles())).toEqual(summary(before));
  const workflowAfter = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});
