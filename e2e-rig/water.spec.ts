import { expect, test } from '@playwright/test';

// The water view against the rig (V1, acceptance item 9). The test asks the simulated machine
// for hot water and flush through the API, as the DE1's own buttons would (the skin starts
// neither). On the rig (research.md 19) simulated hot water pours about 10 ml/s and ends by
// itself at the volume, and the mock scale is tared and weighs the water; simulated flush
// has flow 0 and does not end by itself, so the skin's stop ends it. Nothing is changed in
// the workflow; any shot or steam record the runs leave is deleted.

const GATEWAY = 'http://localhost:8080';

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

const machineState = async () => (await api('GET', '/api/v1/machine/state')).state.state;
const ids = (kind: 'shots' | 'steams'): Promise<string[]> => api('GET', `/api/v1/${kind}/ids`);

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('hot water and flush started at the machine show the ring, the stream and the cup; stop ends the flush', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflow = await api('GET', '/api/v1/workflow');
  const hotSeconds = Math.round(workflow.hotWaterData.duration);
  const flushSeconds = Math.round(workflow.rinseData.duration);
  const before = { shots: await ids('shots'), steams: await ids('steams') };
  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 30_000 });

    // Hot water: it pours, the cup follows the mock scale's weight, and it ends by itself.
    await api('PUT', '/api/v1/machine/state/hotWater');
    await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
    await expect(page.getByTestId('water-label')).toHaveText(new RegExp(`^Hot water \\d+ / ${hotSeconds} s$`));
    await expect(page.getByTestId('water-stream')).toHaveAttribute('data-moving', 'true');
    await expect(page.getByTestId('water-amount')).toHaveText(/ g$/);
    await expect
      .poll(async () => Number(await page.getByTestId('water-cup-fill').getAttribute('data-level')))
      .toBeGreaterThan(0.2);
    await expect(page.getByTestId('water-view')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('stop')).toHaveCount(0);

    // Flush: flow 0 on the simulation, so the stream stands still while the ring counts.
    await api('PUT', '/api/v1/machine/state/flush');
    await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'flush');
    await expect(page.getByTestId('water-stream')).toHaveAttribute('data-moving', 'false');
    await expect(page.getByTestId('water-cup-fill')).toHaveCount(0);
    await expect(page.getByTestId('water-label')).toHaveText(`Flush 2 / ${flushSeconds} s`, { timeout: 10_000 });
    await page.getByTestId('stop').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('idle');
    await expect(page.getByTestId('water-view')).toHaveCount(0);
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
