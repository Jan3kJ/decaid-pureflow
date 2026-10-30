import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot, PaginatedShots, ShotRecord, ProfileRecord } from '../src/api';
import { isWrite, type RigWorkflow } from './gateway';
import { IDLE } from './idle';
import { phaseTable, recordSamples } from '../src/shell/phases';
import { titleLines } from '../src/shell/profiles';

// The shot against the rig: the skin loads, shows the machine
// state, loads an A-Flow profile, runs a simulated shot with a live graph and stops at the
// target weight. The test removes what it creates (profiles, the shot) and puts the workflow
// back as it was.

const GATEWAY = 'http://localhost:8080';
// A flow-up default: with flow down (dark, 46mm) the simulated machine pours nothing in the
// last step and the shot ends by time at about 2 g.
const PROFILE = 'A-Flow / default-medium';
const TARGET = 42;
/** The simulated cup ended 1.7 to 2.2 g under the target. */
const UNDER = 5;
const OVER = 2;

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
const profileIds = async (): Promise<string[]> => (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).map((record) => record.id);
const points = async (page: Page) => Number(await page.getByTestId('shot-graph').getAttribute('data-points'));

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('a simulated shot: the state, an A-Flow profile, a live graph, the stop at the target weight', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const profilesBefore = await profileIds();
  const shotsBefore = await shotIds();
  const sent: string[] = [];
  page.on('request', (request) => {
    if (isWrite(request, GATEWAY)) {
      sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  try {
    // The skin loads and shows the state the machine sent.
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await expect(page.getByTestId('status')).toHaveAttribute('data-link', 'machine');
    await expect(page.getByTestId('profile-name')).toHaveText(titleLines(workflowBefore.profile.title).name);
    // The state line: every value read from the gateway's streams, the tank from its own.
    await expect(page.getByTestId('state-group')).toHaveText(/^\d+\.\d °C$/);
    await expect(page.getByTestId('state-steam')).toHaveText(/^\d+ °C$/);
    await expect(page.getByTestId('state-tank')).toHaveText(/^\d*0 ml$/, { timeout: 15_000 });
    await expect(page.getByTestId('state-scale')).toHaveText(/^-?\d+\.\d g$/, { timeout: 15_000 });
    await page.screenshot({ path: 'e2e-rig/.results/home-idle-rig.png' });

    // The picker: the skin's default, loaded without a record. Decaid's bundled
    // plugin profile under the same title is not listed. A tap selects it, 'load' loads it.
    await page.getByTestId('open-profiles').click();
    await expect(page.getByTestId('profile-item').first()).toBeVisible();
    await expect(page.getByTestId('profile-item').filter({ hasText: PROFILE })).toHaveCount(1);
    await page.getByTestId('profile-item').filter({ hasText: PROFILE }).click();
    await page.getByTestId('load-profile').click();

    await expect(page.getByTestId('screen-home')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText(titleLines(PROFILE).name);
    // Dose and stop weight are not on home: the workflow holds them.
    const workflow = await api<RigWorkflow>('GET', '/api/v1/workflow');
    expect(workflow.profile.title).toBe(PROFILE);
    expect(workflow.profile.target_weight).toBe(TARGET);
    expect(workflow.context.targetYield).toBe(TARGET);
    expect(workflow.context.targetDoseWeight).toBe(16);
    expect(sent.filter((call) => call === 'POST /api/v1/profiles')).toEqual([]);

    // The shot: started at the machine, here through the gateway as the removed start button
    // did; home shows the shot by itself and the graph grows while it runs.
    await expect(page.getByRole('button', { name: /start/ })).toHaveCount(0);
    await api('PUT', '/api/v1/machine/state/espresso');
    await expect(page.getByTestId('shot-plot')).toBeVisible({ timeout: 15_000 });
    // While the shot runs the profile and bean buttons are shown but off.
    await expect(page.getByTestId('open-profiles')).toBeDisabled();
    await expect(page.getByTestId('open-pick')).toBeDisabled();
    await expect.poll(() => points(page), { timeout: 15_000 }).toBeGreaterThan(20);
    const early = await points(page);
    await expect.poll(() => points(page), { timeout: 15_000 }).toBeGreaterThan(early + 20);
    expect(parseFloat((await page.getByTestId('shot-timer').textContent())!)).toBeGreaterThan(2);
    for (const line of ['pressure', 'flow', 'temperature']) {
      expect((await page.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(100);
    }
    // The right column is live: the weight, pressure, flow and temperature have numbers, and stop is there.
    for (const id of ['shot-weight', 'shot-pressure', 'shot-flow', 'shot-temperature']) {
      expect(parseFloat((await page.getByTestId(id).textContent())!)).not.toBeNaN();
    }
    await expect(page.getByTestId('shot-column').getByTestId('stop')).toBeEnabled();
    // The step that runs is the state line's last item, a step of the profile.
    const steps = workflow.profile.steps.map((step, i) => step.name?.trim() || `Step ${i + 1}`);
    await expect(page.getByTestId('status-title')).toHaveText('Pouring');
    expect(steps).toContain(await page.getByTestId('state-step').textContent());
    await expect(page.getByTestId('shot-timer-label')).toHaveText('time');
    await page.screenshot({ path: 'e2e-rig/.results/espresso-rig.png' });

    // It ends by itself at the target weight; home keeps the finished shot with the per-phase
    // table, its time and weight in the column.
    await expect(page.getByTestId('shot-phases')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await expect(page.getByTestId('shot-phases').locator('tbody th')).toHaveText(['Preinfusion', 'Extraction', 'Total']);
    const live = {
      preinfusion: Number(await page.getByTestId('phase-preinfusion-seconds').textContent()),
      total: Number(await page.getByTestId('phase-total-seconds').textContent()),
      volume: Number(await page.getByTestId('phase-total-volume').textContent()),
    };
    await expect(page.getByTestId('shot-plot')).toHaveCount(0);
    await expect(page.getByTestId('last-shot')).toBeVisible();
    await expect(page.getByTestId('stop')).toHaveCount(0);
    await expect(page.getByTestId('shot-column').getByTestId('profile-name')).toHaveText(titleLines(PROFILE).name);
    await expect(page.getByTestId('shot-column').getByTestId('open-pick')).toBeVisible();
    await expect(page.getByTestId('shot-timer-label')).toHaveText('time, finished');
    const grams = parseFloat((await page.getByTestId('shot-weight').textContent())!);
    expect(parseFloat((await page.getByTestId('shot-timer').textContent())!)).toBeGreaterThan(5);
    expect(grams).toBeGreaterThan(TARGET - UNDER);
    expect(grams).toBeLessThan(TARGET + OVER);
    await page.screenshot({ path: 'e2e-rig/.results/home-rig.png' });

    // Decaid stopped it, not the skin: the skin sent no start, no stop and no tare.
    expect(sent.filter((call) => call.includes('/machine/state/'))).toEqual([]);
    expect(sent.filter((call) => call.includes('/scale/'))).toEqual([]);
    expect(sent.filter((call) => call.includes('/machine/profile'))).toEqual([]);

    // The record names the profile that was pulled: what the history needs.
    let shot!: ShotRecord;
    await expect
      .poll(
        async () => {
          shot = await api<ShotRecord>('GET', '/api/v1/shots/latest');
          return shotsBefore.includes(shot.id);
        },
        { timeout: 30_000 },
      )
      .toBe(false);
    expect(shot.stopReason).toBe('targetWeight');

    // Home's table, from the live frames, is the table of Decaid's record of the shot.
    const record = await api<ShotRecord>('GET', `/api/v1/shots/${encodeURIComponent(shot.id)}`);
    const { samples, finalWeight } = recordSamples(record);
    const table = phaseTable(samples, finalWeight)!;
    console.log(`rig shot: live table ${JSON.stringify(live)}, record's ${JSON.stringify(table)}`);
    expect(Math.abs(live.preinfusion - Number(table.preinfusion.seconds))).toBeLessThanOrEqual(1);
    expect(Math.abs(live.total - Number(table.total.seconds))).toBeLessThanOrEqual(1);
    expect(Math.abs(live.volume - Number(table.total.volume))).toBeLessThanOrEqual(3);
    expect(shot.workflow!.profile!.title).toBe(PROFILE);
    // The default has no record in Decaid: the shot keeps the workflow's copy of it, its values in the notes.
    expect(shot.workflow!.profile!.steps).toEqual(workflow.profile.steps);
    expect(shot.workflow!.profile!.notes).toBe(workflow.profile.notes);
    expect(shot.workflow!.context!.targetYield).toBe(TARGET);

    // Its measurements carry the substate and the targets, so a shot from the history is cut
    // at the water and drawn with its targets as the live one (src/history/entries.ts).
    const measurements: { machine: { state: { substate: string }; targetFlow: number; targetPressure: number } }[] = (
      await api<ShotRecord>('GET', `/api/v1/shots/${encodeURIComponent(shot.id)}`)
    ).measurements;
    const substates = [...new Set(measurements.map((measurement) => measurement.machine.state.substate))];
    console.log(`rig shot: ${measurements.length} measurements, substates in order of first appearance: ${substates.join(', ')}`);
    expect(substates).toContain('pouring');
    expect(measurements.some((measurement) => measurement.machine.targetFlow > 0)).toBe(true);
    expect(measurements.some((measurement) => measurement.machine.targetPressure > 0)).toBe(true);
    // The graph and the timer start at the water: the first espresso frames of the simulation say preparingForShot.
    expect(Number(await page.getByTestId('last-shot').getByTestId('shot-graph').getAttribute('data-points'))).toBeLessThanOrEqual(
      measurements.length,
    );
  } finally {
    const state = await api<MachineSnapshot>('GET', '/api/v1/machine/state').catch(() => undefined);
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
  const workflowAfter = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});
