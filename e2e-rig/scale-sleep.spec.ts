import { expect, test } from '@playwright/test';
import { IDLE } from './idle';

// Acceptance items 6 and 21 (spec section 5) against the rig: a tap on the weight in the state
// line tares, and the scale stream reads about 0 after it; with Decaid's setting
// blockTareDuringShot on, a tare during a simulated shot shows the notice; the sleep button
// puts the machine into `sleeping` and a touch wakes it. The tests delete the shot they
// create and put the setting and the screen's brightness back. That settings survive a reload
// needs no gateway: e2e/scale-settings-sleep.spec.ts. The simulated scale, disconnected, is
// connected again by the skin's scan (spec 3.9, acceptance 40) and is left connected.

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

const machineState = async (): Promise<string> => (await api('GET', '/api/v1/machine/state')).state.state;
const shotIds = async (): Promise<string[]> =>
  (await api('GET', '/api/v1/shots?limit=100')).items.map((shot: { id: string }) => shot.id);

/** The next weight of the scale stream, read outside the skin. */
function scaleWeight(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${GATEWAY.replace('http', 'ws')}/ws/v1/scale/snapshot`);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('no weight from /ws/v1/scale/snapshot in 10 s'));
    }, 10_000);
    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data));
      if (typeof frame.weight !== 'number') return;
      clearTimeout(timer);
      socket.close();
      resolve(frame.weight);
    };
  });
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('scale: no scale page; a tap on the weight tares, and the scale reads about 0 (item 21)', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('menu-list')).toBeVisible();
  await expect(page.getByTestId('open-scale')).toHaveCount(0);
  await page.getByTestId('menu-backdrop').click();
  await expect(page.getByTestId('state-scale')).toHaveText(/^-?\d+\.\d g$/, { timeout: 15_000 });

  const answer = page.waitForResponse((response) => response.url().endsWith('/api/v1/scale/tare'));
  await page.getByTestId('state-scale').click();
  expect((await answer).status()).toBe(200);
  await expect(page.getByTestId('state-scale')).toHaveText(/^-?0\.\d g$/, { timeout: 10_000 });
  await expect.poll(async () => Math.abs(await scaleWeight()), { timeout: 10_000 }).toBeLessThan(0.5);
  await expect(page.getByTestId('tare-notice')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('scale: with blockTareDuringShot on, a tare during a simulated shot shows the notice', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const settingBefore: boolean = (await api('GET', '/api/v1/settings')).blockTareDuringShot ?? false;
  const shotsBefore = await shotIds();

  try {
    await api('POST', '/api/v1/settings', { blockTareDuringShot: true });
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });

    // The shot of whatever profile the workflow holds, started through the gateway as at the
    // machine; the shot's overlay opens on home by itself, under the state line (spec 3.8).
    await api('PUT', '/api/v1/machine/state/espresso');
    await expect(page.getByTestId('shot-overlay')).toBeVisible({ timeout: 15_000 });
    expect(await machineState()).toBe('espresso');

    const answer = page.waitForResponse((response) => response.url().endsWith('/api/v1/scale/tare'));
    await page.getByTestId('state-scale').click();
    const response = await answer;
    expect(response.status()).toBe(400);
    expect((await response.json()).type).toBe('block_tare_during_shot');
    await expect(page.getByTestId('tare-notice')).toContainText('No tare while a shot runs');
    await expect(page.getByTestId('notice')).toHaveCount(0);
    await page.screenshot({ path: 'e2e-rig/.results/tare-blocked-rig.png' });
  } finally {
    if ((await machineState().catch(() => undefined)) === 'espresso') await api('PUT', '/api/v1/machine/state/idle');
    await api('POST', '/api/v1/settings', { blockTareDuringShot: settingBefore });
    // The record of a shot is written a few seconds after its end.
    await page.waitForTimeout(6000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
    }
  }

  expect((await api('GET', '/api/v1/settings')).blockTareDuringShot ?? false).toBe(settingBefore);
  expect(await shotIds()).toEqual(shotsBefore);
  await expect.poll(machineState, { timeout: 30_000 }).toBe('idle');
});

const scaleState = async (): Promise<string | undefined> =>
  (await api('GET', '/api/v1/devices')).find((device: { id: string }) => device.id === 'MockScale')?.state;

/**
 * Disconnects the simulated scale until it stays away for 30 s without a skin: for a while
 * after a wake Decaid takes a preferred scale back by itself (spec 3.9; seen on the rig after
 * the sleep test, 2026-10-19), and then the skin's scan would prove nothing. Otherwise Decaid
 * does not connect it again (seen for 60 s). This test runs before the file's sleep test.
 */
async function dropScale(page: import('@playwright/test').Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await scaleState()) === 'connected') await api('PUT', '/api/v1/devices/disconnect', { deviceId: 'MockScale' });
    await page.waitForTimeout(30_000);
    if ((await scaleState()) !== 'connected') return;
  }
  throw new Error('Decaid connects the simulated scale again by itself');
}

test('scale: the simulated scale, missing at the start or dropped, is connected again by the skin without a touch (spec 3.9, acceptance 40)', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  test.setTimeout(400_000);
  // Only a scan connects it, and a scan takes about 15 s with Bluetooth searched too.
  expect(await scaleState(), 'the rig starts with its simulated scale connected').toBe('connected');
  const scans: string[] = [];
  page.on('request', (request) => request.url().includes('/api/v1/devices/scan') && scans.push(request.url()));

  try {
    // Missing at the start, with the preferred scale set: one round after the first status frame.
    await dropScale(page);
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });
    await expect.poll(scaleState, { timeout: 60_000, intervals: [1_000] }).toBe('connected');
    await expect(page.getByTestId('state-scale')).toHaveText(/ g$/, { timeout: 15_000 });
    expect(scans.length).toBeGreaterThanOrEqual(1);
    expect(scans[0]).toMatch(/\/api\/v1\/devices\/scan\?connect=true&quick=true$/);

    // A drop while the skin runs.
    const before = scans.length;
    await api('PUT', '/api/v1/devices/disconnect', { deviceId: 'MockScale' });
    await expect(page.getByTestId('state-scale')).toHaveText('⚠ looking for it', { timeout: 10_000 });
    await expect.poll(scaleState, { timeout: 60_000, intervals: [1_000] }).toBe('connected');
    await expect(page.getByTestId('state-scale')).toHaveText(/ g$/, { timeout: 15_000 });
    expect(scans.length).toBeGreaterThan(before);
    await page.screenshot({ path: 'e2e-rig/.results/scale-reconnected-rig.png' });
  } finally {
    if ((await scaleState().catch(() => undefined)) !== 'connected') {
      await api('GET', '/api/v1/devices/scan?connect=true').catch(() => undefined);
    }
  }
  expect(await scaleState()).toBe('connected');
});

test('sleep: the button puts the machine into sleeping, a touch wakes it', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const displayBefore = await api('GET', '/api/v1/display');
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(GATEWAY) && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      sent.push(`${request.method()} ${new URL(request.url()).pathname} ${request.postData() ?? ''}`.trim());
    }
  });

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });

    // Sleep is an entry of home's menu.
    await page.getByTestId('menu').click();
    await page.getByTestId('machine-sleep').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('sleeping');
    await expect(page.getByTestId('asleep')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'e2e-rig/.results/asleep-rig.png' });

    await page.touchscreen.tap(1200, 760);
    await expect.poll(machineState, { timeout: 15_000 }).not.toBe('sleeping');
    await expect(page.getByTestId('asleep')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('screen-home')).toBeVisible();
    // The rig drops the scale while the machine sleeps (scalePowerMode "disconnect",
    // research.md 9.1): it is back before the test ends, so the next one finds a scale.
    await expect(page.getByTestId('state-scale')).toHaveText(/ g$/, { timeout: 30_000 });

    const states = sent.filter((call) => call.includes('/machine/state/'));
    expect(states).toEqual(['PUT /api/v1/machine/state/sleeping', 'PUT /api/v1/machine/state/idle']);
    // The brightness is only set where Decaid says this platform can.
    const brightness = sent.filter((call) => call.includes('/display/brightness'));
    if (displayBefore.platformSupported?.brightness === true) {
      await expect
        .poll(() => sent.filter((call) => call.includes('/display/brightness')))
        .toEqual(['PUT /api/v1/display/brightness {"brightness":5}', 'PUT /api/v1/display/brightness {"brightness":100}']);
    } else {
      expect(brightness).toEqual([]);
    }
  } finally {
    if ((await machineState().catch(() => undefined)) === 'sleeping') await api('PUT', '/api/v1/machine/state/idle');
    if (displayBefore.platformSupported?.brightness === true) {
      await api('PUT', '/api/v1/display/brightness', { brightness: displayBefore.requestedBrightness ?? 100 });
    }
  }

  expect(await machineState()).not.toBe('sleeping');
  expect((await api('GET', '/api/v1/display')).requestedBrightness).toBe(displayBefore.requestedBrightness);
});
