import { expect, test, type Page } from '@playwright/test';

// Acceptance item 2 (spec section 5) against the rig: the skin loads, shows the machine
// state, loads an A-Flow profile, runs a simulated shot with a live graph and stops at the
// target weight. The test removes what it creates (profiles, the shot) and puts the workflow
// back as it was.

const GATEWAY = 'http://localhost:8080';
// A flow-up default: with flow down (dark, 46mm) the simulated machine pours nothing in the
// last step and the shot ends by time at about 2 g (research.md, section 10).
const PROFILE = 'A-Flow / default-medium';
const TARGET = 42;
/** The simulated cup ended 1.7 to 2.2 g under the target (research.md 8.2 and 10). */
const UNDER = 5;
const OVER = 2;

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

const shotIds = async (): Promise<string[]> =>
  (await api('GET', '/api/v1/shots?limit=100')).items.map((shot: { id: string }) => shot.id);
const profileIds = async (): Promise<string[]> =>
  (await api('GET', '/api/v1/profiles')).map((record: { id: string }) => record.id);
const points = async (page: Page) => Number(await page.getByTestId('shot-graph').getAttribute('data-points'));

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('a simulated shot: the state, an A-Flow profile, a live graph, the stop at the target weight', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflowBefore = await api('GET', '/api/v1/workflow');
  const profilesBefore = await profileIds();
  const shotsBefore = await shotIds();
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(GATEWAY) && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  try {
    // The skin loads and shows the state the machine sent.
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 15_000 });
    await expect(page.getByTestId('status')).toHaveAttribute('data-link', 'machine');
    await expect(page.getByTestId('profile-name')).toHaveText(workflowBefore.profile.title);

    // The picker: the A-Flow 3.0 defaults are saved where Decaid lacks them, one is loaded.
    await page.getByTestId('open-profiles').click();
    await expect(page.getByTestId('profile-item').first()).toBeVisible();
    if (await page.getByTestId('offer-defaults').isVisible()) {
      await page.getByTestId('add-defaults').click();
      await expect(page.getByTestId('offer-defaults')).toHaveCount(0);
    }
    // Decaid bundles the plugin's default under the same title: the 3.0 one carries the tag.
    await page.getByTestId('profile-item').filter({ hasText: PROFILE }).filter({ hasText: 'A-Flow 3.0' }).click();
    await page.getByTestId('load-profile').click();

    await expect(page.getByTestId('screen-home')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText(PROFILE);
    await expect(page.getByTestId('target-weight')).toHaveText(`${TARGET} g`);
    await expect(page.getByTestId('dose')).toHaveText('16 g');
    const workflow = await api('GET', '/api/v1/workflow');
    expect(workflow.profile.title).toBe(PROFILE);
    expect(workflow.profile.target_weight).toBe(TARGET);
    expect(workflow.context.targetYield).toBe(TARGET);

    // The shot: the espresso screen opens by itself and the graph grows while it runs.
    await page.getByTestId('start').click();
    await expect(page.getByTestId('screen-espresso')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('espresso-profile')).toHaveText(PROFILE);
    await expect.poll(() => points(page), { timeout: 15_000 }).toBeGreaterThan(20);
    const early = await points(page);
    await expect.poll(() => points(page), { timeout: 15_000 }).toBeGreaterThan(early + 20);
    expect(parseFloat((await page.getByTestId('shot-timer').textContent())!)).toBeGreaterThan(2);
    for (const line of ['pressure', 'flow', 'temperature']) {
      expect((await page.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(100);
    }
    await page.screenshot({ path: 'e2e-rig/.results/espresso-rig.png' });

    // It ends by itself at the target weight; home keeps the finished graph.
    await expect(page.getByTestId('screen-home')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('status-title')).toHaveText('Idle');
    await expect(page.getByTestId('last-shot')).toBeVisible();
    const grams = parseFloat((await page.getByTestId('last-shot-weight').textContent())!);
    expect(grams).toBeGreaterThan(TARGET - UNDER);
    expect(grams).toBeLessThan(TARGET + OVER);
    await page.screenshot({ path: 'e2e-rig/.results/home-rig.png' });

    // Decaid stopped it, not the skin: the skin sent no stop and no tare.
    expect(sent.filter((call) => call.includes('/machine/state/'))).toEqual(['PUT /api/v1/machine/state/espresso']);
    expect(sent.filter((call) => call.includes('/scale/'))).toEqual([]);
    expect(sent.filter((call) => call.includes('/machine/profile'))).toEqual([]);

    // The record names the profile that was pulled: what the history (spec 3.5) needs.
    let shot: any;
    await expect
      .poll(
        async () => {
          shot = await api('GET', '/api/v1/shots/latest');
          return shotsBefore.includes(shot.id);
        },
        { timeout: 30_000 },
      )
      .toBe(false);
    expect(shot.stopReason).toBe('targetWeight');
    expect(shot.workflow.profile.title).toBe(PROFILE);
    expect(shot.workflow.context.targetYield).toBe(TARGET);
  } finally {
    const state = await api('GET', '/api/v1/machine/state').catch(() => undefined);
    if (state?.state.state === 'espresso') await api('PUT', '/api/v1/machine/state/idle');
    // The record of a shot is written a few seconds after its end.
    await page.waitForTimeout(5000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
    }
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
  }

  expect(await shotIds()).toEqual(shotsBefore);
  expect(await profileIds()).toEqual(profilesBefore);
  const workflowAfter = await api('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});
