import { expect, test } from '@playwright/test';
import type { MachineSnapshot, PaginatedShots, ShotRecord, ProfileRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { IDLE } from './idle';

// T1 (spec 3.8, acceptance 27) against the rig: a simulated shot's live graph ends where the
// shot ends and is as long as Decaid's record of it, within one second; its scale stays at 10
// (the simulation reaches 10.0 bar, not more); and the running time axis starts at the
// profile's last shot. The simulated machine goes from pouring to idle without a tail
// (research.md 23). The test removes the shot it makes and puts the workflow back.

const GATEWAY = 'http://localhost:8080';
const PROFILE = 'A-Flow / default-medium';
const TARGET = 36;

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

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('a simulated shot: the live graph ends with the shot, as long as its record, on a scale to 10', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  test.setTimeout(240_000);

  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const shotsBefore = await shotIds();
  const record = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find(
    (candidate: { profile: { title: string } }) => candidate.profile.title === PROFILE,
  );
  expect(record, `the rig has ${PROFILE}`).toBeTruthy();
  // The rig's one shot is of this profile: the running axis starts at its length.
  const previous = (await api<PaginatedShots>('GET', `/api/v1/shots?profileTitle=${encodeURIComponent(PROFILE)}&limit=1`)).items[0];

  try {
    await api('PUT', '/api/v1/workflow', { profile: record!.profile, context: { targetDoseWeight: 18, targetYield: TARGET } });
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await expect(page.getByTestId('profile-name')).toHaveText(PROFILE);
    if (previous)
      await page
        .waitForResponse((response) => response.url().includes(`/api/v1/shots/${previous.id}`), { timeout: 15_000 })
        .catch(() => undefined);

    await api('PUT', '/api/v1/machine/state/espresso');
    await expect(page.getByTestId('shot-overlay')).toBeVisible({ timeout: 15_000 });
    const graph = page.getByTestId('shot-graph');
    await expect.poll(async () => Number(await graph.getAttribute('data-points')), { timeout: 20_000 }).toBeGreaterThan(30);
    const running = Number(await graph.getAttribute('data-seconds'));
    console.log(`rig shot: running time axis ${running} s${previous ? ` (last shot ${previous.id})` : ''}`);
    expect(running % 10).toBe(0);
    if (previous) expect(running).toBe(30);
    expect(await graph.getAttribute('data-scale')).toBe('10');
    await page.screenshot({ path: 'e2e-rig/.results/espresso-shot-end-rig.png' });

    // The overlay stays after the shot (spec 3.8); a tap closes it to home's last shot.
    await page.getByTestId('shot-close').click({ timeout: 180_000 });
    await expect(page.getByTestId('screen-home')).toBeVisible();
    const last = page.getByTestId('last-shot');
    const seconds = parseFloat((await page.getByTestId('last-shot-time').textContent())!);
    const points = Number(await last.getByTestId('shot-graph').getAttribute('data-points'));
    expect(await last.getByTestId('shot-graph').getAttribute('data-scale')).toBe('10');

    // Decaid's record of the same shot: from its first frame with water to its last.
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
    const measurements: { machine: { timestamp: string; state: { substate: string } } }[] = (
      await api<ShotRecord>('GET', `/api/v1/shots/${encodeURIComponent(shot.id)}`)
    ).measurements;
    const waiting = ['idle', 'preparingForShot'];
    const first = measurements.findIndex((m) => !waiting.includes(m.machine.state.substate));
    const at = (i: number) => new Date(measurements[i].machine.timestamp).getTime() / 1000;
    const recorded = at(measurements.length - 1) - at(first);
    const substates = [...new Set(measurements.map((m) => m.machine.state.substate))];
    console.log(
      `rig shot: live ${seconds} s / ${points} points, record ${recorded.toFixed(2)} s / ${measurements.length - first} measurements from the water, substates ${substates.join(', ')}`,
    );
    expect(Math.abs(seconds - recorded)).toBeLessThan(1);
    expect(Math.abs(points - (measurements.length - first))).toBeLessThanOrEqual(10);
  } finally {
    const state = await api<MachineSnapshot>('GET', '/api/v1/machine/state').catch(() => undefined);
    if (state?.state.state === 'espresso') await api('PUT', '/api/v1/machine/state/idle');
    await page.waitForTimeout(5000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
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
  const workflowAfter = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});
