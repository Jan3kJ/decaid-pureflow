import { expect, test } from '@playwright/test';
import type { MachineSnapshot, ProfileRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { DEFAULT_PROFILES } from '../src/aflow';
import { workflowProfile } from '../src/editor/storage';
import { defaultProfile } from '../src/shell/profiles';

// The A-Flow 3.0 defaults kept in the skin against the rig (T5, spec 3.8, acceptance item 31):
// the picker lists the skin's five first and Decaid's bundled plugin profiles under the same
// titles not, the other bundled A-Flow profiles as before; a default loads into the workflow
// without a record and without a POST of a profile. The test stores nothing and puts the
// workflow back as it was.

const GATEWAY = 'http://localhost:8080';
const LIGHT = DEFAULT_PROFILES[1];

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

const profileIds = async (): Promise<string[]> => (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).map((record) => record.id);

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('the picker lists the skin’s defaults and loads one into the workflow without storing it', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const profilesBefore = await profileIds();
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
    await expect(items.locator('.title').first()).toHaveText('A-Flow / default-floral', { timeout: 15_000 });
    // The gateway's list has arrived once a profile of Decaid's own is listed.
    await expect(items.filter({ hasText: 'A-Flow / default-very-dark' })).toHaveCount(1, { timeout: 15_000 });
    await expect(items.filter({ hasText: 'A-Flow / default-like-dflow' })).toHaveCount(1);
    await expect(items.locator('.title').first().locator('..')).toHaveAttribute('data-default', 'true');
    await expect(items.locator('.title').nth(4)).toHaveText('A-Flow / default-46mm');
    // Decaid bundles the plugin's light, medium and dark under these titles: listed once, as the skin's.
    for (const entry of DEFAULT_PROFILES) {
      await expect(items.filter({ hasText: entry.title })).toHaveCount(1);
      await expect(items.filter({ hasText: entry.title })).toHaveAttribute('data-default', 'true');
    }
    await expect(page.getByText('not in Decaid')).toHaveCount(0);

    await items.filter({ hasText: LIGHT.title }).click();
    await page.getByTestId('load-profile').click();
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText(LIGHT.title);

    // What Decaid's workflow holds after a default is loaded without a record (research.md 25).
    const workflow = await api<RigWorkflow>('GET', '/api/v1/workflow');
    console.log(
      `rig workflow after loading ${LIGHT.title}: ${JSON.stringify({
        id: workflow.id,
        name: workflow.name,
        keys: Object.keys(workflow),
        profileKeys: Object.keys(workflow.profile),
        notes: workflow.profile.notes,
        steps: workflow.profile.steps.length,
        target_weight: workflow.profile.target_weight,
        context: workflow.context,
      })}`,
    );
    const expected = workflowProfile(defaultProfile(LIGHT), LIGHT.params);
    expect(workflow.profile.title).toBe(LIGHT.title);
    expect(workflow.profile.notes).toBe(expected.notes);
    expect(workflow.profile.steps).toHaveLength(expected.steps.length);
    expect(workflow.profile.target_weight).toBe(LIGHT.params.stopWeight);
    expect(workflow.context.targetYield).toBe(LIGHT.params.stopWeight);
    expect(workflow.context.targetDoseWeight).toBe(LIGHT.params.dose);
    // Nothing stored: no POST of a profile, the same profiles as before.
    expect(sent.filter((call) => call.startsWith('POST /api/v1/profiles'))).toEqual([]);
    expect(await profileIds()).toEqual(profilesBefore);

    // Opened again, the loaded default is marked.
    await page.getByTestId('open-profiles').click();
    await expect(items.filter({ hasText: 'loaded' })).toContainText(LIGHT.title);
  } finally {
    await api('PUT', '/api/v1/workflow', {
      profile: workflowBefore.profile,
      context: {
        targetYield: workflowBefore.context?.targetYield ?? 0,
        targetDoseWeight: workflowBefore.context?.targetDoseWeight ?? null,
      },
    });
  }

  expect(await profileIds()).toEqual(profilesBefore);
  const workflowAfter = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});
