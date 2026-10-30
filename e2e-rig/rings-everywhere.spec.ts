import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot } from '../src/api';

// The hot water and flush ring on every screen against the rig:
// hot water is started through the API, as at the machine, with the screen
// already open; the settings page, the picker and the hot water page show the one large ring over
// their main frame with the kind in it; a flush on the beans screen shows it too, and its stop
// stops it. Simulated
// hot water ends by itself after about 5 s; simulated flush does not. Nothing is
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
  await expect(page.getByTestId('water-view')).toHaveCount(0);
}

test('hot water on settings, the picker and its page, flush on beans: the large ring on each, its stop stops the flush', async ({
  page,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const before = { shots: await ids('shots'), steams: await ids('steams') };
  const ring = page.getByTestId('water-view');
  try {
    for (const screen of ['settings', 'profiles', 'hot-water']) {
      await open(page, screen);
      await api('PUT', '/api/v1/machine/state/hotWater');
      await expect(ring).toHaveAttribute('data-kind', 'hotWater');
      await expect(page.getByTestId('water-label')).toHaveText('Hot water');
      await expect(page.getByTestId('water-time')).toHaveText(/^\d+ \/ \d+ s$/);
      await expect(page.getByTestId('water-cover')).toBeVisible();
      await expect(page.getByTestId('small-ring')).toHaveCount(0);
      await expect(ring).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');
    }

    await open(page, 'beans');
    await api('PUT', '/api/v1/machine/state/flush');
    await expect(ring).toHaveAttribute('data-kind', 'flush');
    await expect(page.getByTestId('water-label')).toHaveText('Flush');
    await page.getByTestId('water-stop').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');
    await expect(ring).toHaveCount(0);
    await expect(page.getByTestId('screen-beans')).toBeVisible();
    await expect(page.getByTestId('beans-add')).toBeVisible();
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
