import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot, PaginatedShots, ProfileRecord, ShotRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { IDLE } from './idle';

// Acceptance item 5 (spec section 5) against the rig: simulated shots with another profile
// or another bean give one entry each, a changed grinder setting does not; tapping an entry
// restores profile, bean and grinder setting (the workflow is read back) and shows its
// graph; the overlay closes on selection and on a tap outside it. The test deletes the shots
// it makes and puts the workflow back as it was.

const GATEWAY = 'http://localhost:8080';
// Two bundled profiles of a few flow steps: the simulated cup has 3 g after about 3 s.
const PROFILE_A = 'Rao Allongé';
const PROFILE_B = 'PSPH';
const YIELD = 3;
const ROASTER = 'D8b Rig';
const BEAN_A = 'D8b Bean A';
const BEAN_B = 'D8b Bean B';
/** Every field of the context the skin or the test writes; what the workflow lacked is cleared at the end. */
const WRITTEN = ['coffeeName', 'coffeeRoaster', 'beanBatchId', 'grinderSetting', 'grinderModel', 'grinderId'] as const;

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

const shotIds = async (): Promise<string[]> =>
  (await api<PaginatedShots>('GET', '/api/v1/shots?limit=100')).items.map((shot: { id: string }) => shot.id);
const machineState = async (): Promise<string> => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state;

/** The points of a record's graph: its measurements from the first one in which water moves (src/shell/shot.ts). */
function withWater(record: { measurements: { machine: { state: { substate: string } } }[] }): number {
  const first = record.measurements.findIndex(
    (measurement) => !['idle', 'preparingForShot'].includes(measurement.machine.state.substate),
  );
  return first < 0 ? record.measurements.length : record.measurements.length - first;
}

/** One simulated shot with the given workflow; returns its record, with measurements. */
async function pull(page: Page, profile: unknown, context: Record<string, unknown>): Promise<ShotRecord> {
  const known = await shotIds();
  await api('PUT', '/api/v1/workflow', { profile, context: { ...context, targetYield: YIELD } });
  await api('PUT', '/api/v1/machine/state/espresso');
  await expect.poll(machineState, { timeout: 15_000, intervals: [200] }).toBe('espresso');
  // Decaid stops it at the target yield; the test only stops a shot that does not end.
  try {
    await expect.poll(machineState, { timeout: 40_000, intervals: [300] }).not.toBe('espresso');
  } catch {
    await api('PUT', '/api/v1/machine/state/idle');
  }
  // The record is written a few seconds after the end (research.md 10.1).
  let id: string | undefined;
  await expect
    .poll(async () => (id = (await shotIds()).find((candidate) => !known.includes(candidate))), {
      timeout: 30_000,
      intervals: [500],
    })
    .toBeTruthy();
  await page.waitForTimeout(500);
  return api<ShotRecord>('GET', `/api/v1/shots/${encodeURIComponent(id!)}`);
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('the history: shots with another profile or bean are entries, a tap restores one and shows its graph', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const shotsBefore = await shotIds();
  const profiles: { profile: { title: string } }[] = await api<ProfileRecord[]>('GET', '/api/v1/profiles');
  const profileA = profiles.find((record) => record.profile.title === PROFILE_A)!.profile;
  const profileB = profiles.find((record) => record.profile.title === PROFILE_B)!.profile;

  try {
    // Four shots, three combinations: bean A twice with another grinder setting, bean B, and
    // bean B with another profile.
    await pull(page, profileA, { coffeeName: BEAN_A, coffeeRoaster: ROASTER, grinderSetting: '5.2' });
    const shotB = await pull(page, profileA, { coffeeName: BEAN_B, coffeeRoaster: ROASTER, grinderSetting: '6.0' });
    const shotA = await pull(page, profileA, { coffeeName: BEAN_A, coffeeRoaster: ROASTER, grinderSetting: '4.8' });
    const shotC = await pull(page, profileB, { coffeeName: BEAN_B, coffeeRoaster: ROASTER, grinderSetting: '6.0' });
    for (const shot of [shotA, shotB, shotC]) expect(shot.measurements.length).toBeGreaterThan(5);

    // Something else is current when the skin opens.
    await api('PUT', '/api/v1/workflow', {
      profile: workflowBefore.profile,
      context: { coffeeName: 'D8b Other', coffeeRoaster: null, grinderSetting: '1' },
    });
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await expect(page.getByTestId('profile-name')).toHaveText(workflowBefore.profile.title);

    // The tab opens the overlay. The rig's older shots have their own entries.
    await page.getByTestId('nav-history').tap();
    await expect(page.getByTestId('history')).toBeVisible();
    const mine = page.getByTestId('history-entry').filter({ hasText: ROASTER });
    await expect(mine).toHaveCount(3);
    await expect(mine.getByTestId('entry-profile')).toHaveText([PROFILE_B, PROFILE_A, PROFILE_A]);
    await expect(mine.getByTestId('entry-bean')).toHaveText([
      `${ROASTER} · ${BEAN_B}`,
      `${ROASTER} · ${BEAN_A}`,
      `${ROASTER} · ${BEAN_B}`,
    ]);
    // The changed grinder setting made no entry: bean A shows the latest one, of two shots.
    await expect(mine.nth(1).getByTestId('entry-grinder')).toHaveText('grinder 4.8');
    await expect(mine.nth(1).getByTestId('entry-when')).toContainText('2 shots');
    await expect(mine.nth(1)).toHaveAttribute('data-shot', shotA.id);
    await page.screenshot({ path: 'e2e-rig/.results/history-rig.png' });

    // A tap outside closes it and leaves the workflow alone.
    await page.touchscreen.tap(1100, 400);
    await expect(page.getByTestId('history')).toHaveCount(0);
    expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).context.coffeeName).toBe('D8b Other');

    // A tap on an entry closes it, restores the entry and shows the graph of its latest shot.
    await page.getByTestId('nav-history').tap();
    await mine.nth(1).tap();
    await expect(page.getByTestId('history')).toHaveCount(0);
    await expect(page.getByTestId('history-graph')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText(PROFILE_A);
    await expect(page.getByTestId('recalled-bean')).toHaveText(`${ROASTER} · ${BEAN_A}`);
    await expect(page.getByTestId('recalled-grinder')).toHaveText('grinder 4.8');
    let workflow = await api<RigWorkflow>('GET', '/api/v1/workflow');
    expect(workflow.profile).toEqual(shotA.workflow!.profile);
    expect(workflow.context.coffeeName).toBe(BEAN_A);
    expect(workflow.context.coffeeRoaster).toBe(ROASTER);
    expect(workflow.context.grinderSetting).toBe('4.8');
    const graph = page.getByTestId('history-graph');
    await expect(graph.getByTestId('shot-graph')).toHaveAttribute('data-points', String(withWater(shotA)));
    for (const line of ['pressure', 'flow', 'temperature']) {
      expect((await graph.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(50);
    }
    await page.screenshot({ path: 'e2e-rig/.results/history-restored-rig.png' });

    // The entry of the other profile, with the overlay opened by a swipe this time.
    await page.mouse.move(10, 400);
    await page.mouse.down();
    await page.mouse.move(300, 410, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('history')).toBeVisible();
    await mine.first().tap();
    await expect(page.getByTestId('history')).toHaveCount(0);
    await expect(page.getByTestId('profile-name')).toHaveText(PROFILE_B);
    await expect(graph.getByTestId('shot-graph')).toHaveAttribute('data-points', String(withWater(shotC)));
    workflow = await api<RigWorkflow>('GET', '/api/v1/workflow');
    expect(workflow.profile).toEqual(shotC.workflow!.profile);
    expect(workflow.context.coffeeName).toBe(BEAN_B);
    expect(workflow.context.grinderSetting).toBe('6.0');
  } finally {
    if ((await machineState().catch(() => undefined)) === 'espresso') await api('PUT', '/api/v1/machine/state/idle');
    await page.waitForTimeout(5000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
    }
    const context = workflowBefore.context ?? {};
    await api('PUT', '/api/v1/workflow', {
      profile: workflowBefore.profile,
      context: {
        ...Object.fromEntries(WRITTEN.map((key) => [key, context[key] ?? null])),
        targetYield: context.targetYield ?? 0,
        targetDoseWeight: context.targetDoseWeight ?? null,
      },
    });
  }

  expect(await shotIds()).toEqual(shotsBefore);
  const workflowAfter = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});
