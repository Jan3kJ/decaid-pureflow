import { expect, test } from '@playwright/test';

// Acceptance item 6 (spec section 5) against the rig: tare answers; with Decaid's setting
// blockTareDuringShot on, a tare during a simulated shot shows the notice; the sleep button
// puts the machine into `sleeping` and a touch wakes it. The tests delete the shot they
// create and put the setting and the screen's brightness back. That settings survive a reload
// needs no gateway: e2e/scale-settings-sleep.spec.ts.

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

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('scale: the rig says connected, and tare answers', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 15_000 });
  await page.getByTestId('menu').click();
  await page.getByTestId('open-scale').click();
  await expect(page.getByTestId('scale-link')).toHaveText('Connected', { timeout: 15_000 });
  await expect(page.getByTestId('scale-page-weight')).toContainText('g');

  const answer = page.waitForResponse((response) => response.url().endsWith('/api/v1/scale/tare'));
  await page.getByTestId('tare').click();
  expect((await answer).status()).toBe(200);
  await expect(page.getByTestId('scale-page-weight')).toHaveText('0.0g', { timeout: 10_000 });
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
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 15_000 });

    // The shot of whatever profile the workflow holds, started through the gateway as at the
    // machine; the espresso screen opens by itself.
    await api('PUT', '/api/v1/machine/state/espresso');
    await expect(page.getByTestId('screen-espresso')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('nav-home').click();
    await page.getByTestId('menu').click();
    await page.getByTestId('open-scale').click();
    expect(await machineState()).toBe('espresso');

    const answer = page.waitForResponse((response) => response.url().endsWith('/api/v1/scale/tare'));
    await page.getByTestId('tare').click();
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
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 30_000 });

    // Sleep is an entry of home's menu.
    await page.getByTestId('menu').click();
    await page.getByTestId('sleep').click();
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
