import { expect, test } from '@playwright/test';
import type { MachineSnapshot } from '../src/api';
import { IDLE } from './idle';
import { toPage } from '../e2e/touch';

// The countdown ring on every screen against the rig: hot water is
// started through the API, as at the machine; home shows the large ring over its graph, the steam
// page the same ring over its graph, and a tap on its stop stops the hot water. Nothing is changed in the
// workflow; any shot or steam record the run leaves is deleted.

const GATEWAY = 'http://localhost:8080';

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

const machineState = async () => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state;
const ids = (kind: 'shots' | 'steams'): Promise<string[]> => api('GET', `/api/v1/${kind}/ids`);

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('hot water started at the machine: the ring on home and on steam, whose stop stops it', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);

  const before = { shots: await ids('shots'), steams: await ids('steams') };
  const ring = page.getByTestId('water-view');
  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });

    await api('PUT', '/api/v1/machine/state/hotWater');
    await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
    await expect(page.getByTestId('water-time')).toHaveText(/^\d+ \/ \d+ s$/);
    await expect(page.getByTestId('shot-column')).toBeVisible();

    await toPage(page, 'steam');
    await expect(page.getByTestId('screen-steam')).toBeVisible();
    await expect(ring).toHaveAttribute('data-kind', 'hotWater');
    await expect(page.getByTestId('water-time')).toHaveText(/^\d+ \/ \d+ s$/);
    await expect.poll(async () => Number(await page.getByTestId('water-ring').getAttribute('data-share'))).toBeGreaterThan(0);
    await page.getByTestId('water-stop').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');
    await expect(ring).toHaveCount(0);
    await expect(page.getByTestId('screen-steam')).toBeVisible();
  } finally {
    if ((await machineState()) !== 'idle') await api('PUT', '/api/v1/machine/state/idle');
    for (const kind of ['shots', 'steams'] as const) {
      for (const id of await ids(kind)) {
        if (!before[kind].includes(id)) await api('DELETE', `/api/v1/${kind}/${encodeURIComponent(id)}`);
      }
    }
  }
  expect(await ids('shots')).toEqual(before.shots);
  expect(await ids('steams')).toEqual(before.steams);
});
