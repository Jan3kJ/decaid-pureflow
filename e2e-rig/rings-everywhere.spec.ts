import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot } from '../src/api';

// The hot water and flush ring on every screen against the rig (Y6, spec 3.12, acceptance 78):
// hot water is started through the API, as at the machine, with the screen already open; the
// settings page and the picker show the small ring with the kind under it, the hot water page
// its large ring; a flush on the beans screen shows the small ring, whose tap stops it. Simulated
// hot water ends by itself after about 5 s (research.md 19); simulated flush does not. Nothing is
// changed in the workflow; any shot or steam record the runs leave is deleted.

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

/** Opens the skin on `screen`, as if it had been shown before the reload. */
async function open(page: Page, screen: string) {
  await page.addInitScript((stored) => localStorage.setItem('pureflow.screen', stored), screen);
  await page.goto('/');
  await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
  // The skin has the machine's frames: the idle machine shows no ring.
  await expect.poll(machineState, { timeout: 30_000 }).toBe('idle');
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('small-ring')).toHaveCount(0);
}

test('hot water on settings, the picker and its page, flush on beans: a ring on each, the small one stops the flush', async ({
  page,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const before = { shots: await ids('shots'), steams: await ids('steams') };
  const small = page.getByTestId('small-ring');
  try {
    for (const screen of ['settings', 'profiles']) {
      await open(page, screen);
      await api('PUT', '/api/v1/machine/state/hotWater');
      await expect(small).toHaveAttribute('data-kind', 'hotWater');
      await expect(page.getByTestId('small-ring-kind')).toHaveText('Hot water');
      await expect(page.getByTestId('small-ring-time')).toHaveText(/^\d+ \/ \d+ s$/);
      await expect(small).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');
    }

    await open(page, 'hot-water');
    await api('PUT', '/api/v1/machine/state/hotWater');
    await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
    await expect(small).toHaveCount(0);
    await expect(page.getByTestId('water-view')).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');

    await open(page, 'beans');
    await api('PUT', '/api/v1/machine/state/flush');
    await expect(small).toHaveAttribute('data-kind', 'flush');
    await expect(page.getByTestId('small-ring-kind')).toHaveText('Flush');
    await small.click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');
    await expect(small).toHaveCount(0);
    await expect(page.getByTestId('screen-beans')).toBeVisible();
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
