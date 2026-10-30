import { expect, test } from '@playwright/test';
import type { MachineSnapshot, ProfileRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { IDLE } from './idle';

// Against the rig: a simulated shot's weight on home
// settles for 15 s after the shot and is then fixed; hot water, which the mock scale weighs
// after Decaid tared it, changes neither the right column's weight nor the graph, while the
// state line follows the scale. The test logs what the mock scale reads in the 20 s after the
// shot. It deletes the shot and the hot water's record and puts the workflow back.

const GATEWAY = 'http://localhost:8080';
const PROFILE = 'Rao Allongé';
const TARGET = 20;
const WATER = 60;

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

const machineState = async (): Promise<string> => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state;
const shotIds = (): Promise<string[]> => api('GET', '/api/v1/shots/ids');

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('the finished shot keeps its weight after 15 s and through hot water; the state line follows the scale', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  test.setTimeout(280_000);

  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const shotsBefore = await shotIds();
  const profile = (await api<ProfileRecord[]>('GET', '/api/v1/profiles')).find((record) => record.profile.title === PROFILE)!.profile;
  const grams = async (testid: string) => parseFloat((await page.getByTestId(testid).first().textContent()) ?? '');

  try {
    await api('PUT', '/api/v1/workflow', {
      profile,
      context: { targetDoseWeight: 18, targetYield: TARGET },
      hotWaterData: { ...workflowBefore.hotWaterData, volume: WATER, duration: 60 },
    });
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });

    await api('PUT', '/api/v1/machine/state/espresso');
    await expect.poll(machineState, { timeout: 15_000, intervals: [200] }).toBe('espresso');
    await expect(page.getByTestId('last-shot')).toBeVisible({ timeout: 180_000 });
    const ended = Date.now();
    const points = await page.getByTestId('last-shot').getByTestId('shot-graph').getAttribute('data-points');

    // The 20 s after the shot: the column's weight and the scale's, once a second.
    const seen: string[] = [];
    let settled = Number.NaN;
    while (Date.now() - ended < 20_000) {
      const at = ((Date.now() - ended) / 1000).toFixed(1);
      const column = await grams('shot-weight');
      seen.push(`${at} s ${column} g (scale ${await grams('state-scale')} g)`);
      if (Date.now() - ended > 16_000 && Number.isNaN(settled)) settled = column;
      await page.waitForTimeout(1000);
    }
    console.log(`rig fixed weight, after the shot: ${seen.join('; ')}`);
    expect(settled).toBeGreaterThan(TARGET - 5);
    await expect.poll(() => grams('shot-weight')).toBe(settled);

    // Hot water: Decaid tares the mock scale and pours to WATER g, more than the shot.
    await api('PUT', '/api/v1/machine/state/hotWater');
    await expect.poll(machineState, { timeout: 10_000, intervals: [200] }).toBe('hotWater');
    await expect.poll(machineState, { timeout: 70_000, intervals: [300] }).not.toBe('hotWater');
    await expect(page.getByTestId('water-view')).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(() => grams('state-scale'), { timeout: 10_000 }).toBeGreaterThan(WATER - 10);
    const scale = await grams('state-scale');
    console.log(`rig fixed weight, after hot water: column ${await grams('shot-weight')} g, scale ${scale} g`);
    expect(await grams('shot-weight')).toBe(settled);
    expect(await page.getByTestId('last-shot').getByTestId('shot-graph').getAttribute('data-points')).toBe(points);
  } finally {
    if (['espresso', 'hotWater'].includes(await machineState().catch(() => ''))) await api('PUT', '/api/v1/machine/state/idle');
    await page.waitForTimeout(3000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
    }
    await api('PUT', '/api/v1/workflow', {
      profile: workflowBefore.profile,
      context: {
        targetYield: workflowBefore.context?.targetYield ?? 0,
        targetDoseWeight: workflowBefore.context?.targetDoseWeight ?? null,
      },
      hotWaterData: workflowBefore.hotWaterData,
    });
  }
  expect(await shotIds()).toEqual(shotsBefore);
  expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).hotWaterData).toEqual(workflowBefore.hotWaterData);
});
