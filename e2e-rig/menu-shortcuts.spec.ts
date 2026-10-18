import { expect, test } from '@playwright/test';

// Acceptance item 18 (spec 3.7, R4) against the rig: the home menu's steam off writes the
// workflow's steam temperature 0 and the machine's own settings read back a heater that is off;
// steam on brings the temperature back; machine off is sleep, since Decaid 0.8.8 has no state
// that switches the DE1 off (research.md 22), and a touch wakes it. The test leaves the steam
// temperature, the machine's state and the skin's KV backup as it found them. The same with a
// mocked gateway: e2e/menu-shortcuts.spec.ts.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/decaid-skin/settings-backup';

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
const workflowSteam = async (): Promise<number> => (await api('GET', '/api/v1/workflow')).steamSettings.targetTemperature;

/** The machine's own steam target, from the first frame of `/ws/v1/machine/shotSettings`. */
function machineSteamTemp(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${GATEWAY.replace('http', 'ws')}/ws/v1/machine/shotSettings`);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('no frame from /ws/v1/machine/shotSettings in 10 s'));
    }, 10_000);
    socket.onmessage = (event) => {
      clearTimeout(timer);
      socket.close();
      resolve(JSON.parse(String(event.data)).targetSteamTemp);
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

test('home menu: steam off and on again, read back from the machine; machine off is sleep (item 18)', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const temperatureBefore = await workflowSteam();
  const machineBefore = await machineSteamTemp();
  const backupBefore = await api('GET', BACKUP);
  const displayBefore = await api('GET', '/api/v1/display');
  expect(temperatureBefore, 'the rig starts with the steam heater on').toBeGreaterThanOrEqual(135);

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 30_000 });

    await page.getByTestId('menu').click();
    await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on', { timeout: 15_000 });
    await page.getByTestId('steam-heater').click();
    await expect.poll(workflowSteam, { timeout: 15_000 }).toBe(0);
    await expect.poll(machineSteamTemp, { timeout: 15_000 }).toBe(0);
    await page.getByTestId('menu').click();
    await expect(page.getByTestId('steam-heater')).toContainText('Steam on');
    await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is off');
    await page.screenshot({ path: 'e2e-rig/.results/menu-steam-off-rig.png' });

    await page.getByTestId('steam-heater').click();
    await expect.poll(workflowSteam, { timeout: 15_000 }).toBe(temperatureBefore);
    await expect.poll(machineSteamTemp, { timeout: 15_000 }).toBe(temperatureBefore);
    await page.getByTestId('menu').click();
    await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');

    await expect(page.getByTestId('machine-off-detail')).toHaveText('sleeps: Decaid cannot switch the DE1 off');
    await page.getByTestId('machine-off').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('sleeping');
    await expect(page.getByTestId('asleep')).toBeVisible({ timeout: 15_000 });
    await page.touchscreen.tap(1200, 760);
    await expect.poll(machineState, { timeout: 15_000 }).not.toBe('sleeping');
    await expect(page.getByTestId('asleep')).toHaveCount(0, { timeout: 15_000 });
    // The rig drops the scale while the machine sleeps (research.md 13): the next test needs it.
    await expect(page.getByTestId('state-scale')).toHaveText(/ g$/, { timeout: 30_000 });
  } finally {
    if ((await machineState().catch(() => undefined)) === 'sleeping') await api('PUT', '/api/v1/machine/state/idle');
    if ((await workflowSteam().catch(() => undefined)) !== temperatureBefore) {
      await api('PUT', '/api/v1/workflow', { steamSettings: { targetTemperature: temperatureBefore } });
    }
    if (displayBefore.platformSupported?.brightness === true) {
      await api('PUT', '/api/v1/display/brightness', { brightness: displayBefore.requestedBrightness ?? 100 });
    }
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
    else await api('POST', BACKUP, backupBefore);
  }

  expect(await machineState()).not.toBe('sleeping');
  expect(await workflowSteam()).toBe(temperatureBefore);
  expect(await machineSteamTemp()).toBe(machineBefore);
  expect(await api('GET', BACKUP)).toEqual(backupBefore);
});
