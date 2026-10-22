import { expect, test } from '@playwright/test';
import type { MachineSnapshot } from '../src/api';
import { IDLE } from './idle';
import { toPage } from '../e2e/touch';

// The countdown ring on every screen against the rig (W2, spec 3.10): hot water is started
// through the API, as at the machine; home shows its large ring, the steam page the small ring
// in the left column, and a tap on the small ring stops the hot water. Nothing is changed in the
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

test('hot water started at the machine: the ring on home, the small ring on steam, whose tap stops it', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const before = { shots: await ids('shots'), steams: await ids('steams') };
  const small = page.getByTestId('small-ring');
  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });

    await api('PUT', '/api/v1/machine/state/hotWater');
    await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
    await expect(page.getByTestId('water-time')).toHaveText(/^\d+ \/ \d+ s$/);
    await expect(small).toHaveCount(0);

    await toPage(page, 'steam');
    await expect(page.getByTestId('screen-steam')).toBeVisible();
    await expect(small).toHaveAttribute('data-kind', 'hotWater');
    await expect(page.getByTestId('small-ring-time')).toHaveText(/^\d+ \/ \d+ s$/);
    await expect.poll(async () => Number(await small.getAttribute('data-share'))).toBeGreaterThan(0);
    await small.click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');
    await expect(small).toHaveCount(0);
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
