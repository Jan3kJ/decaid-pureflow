import { expect, test } from '@playwright/test';
import type { DecaidSettings, DisplayState, MachineSnapshot, ShotSettings } from '../src/api';
import type { RigWorkflow } from './gateway';
import { IDLE } from './idle';

// Acceptance item 18 (spec 3.7, R4) against the rig: the home menu's steam off writes the
// workflow's steam temperature 0 and the machine's own settings read back a heater that is off;
// steam on brings the temperature back. The two sleeps (spec 3.10, acceptance 56) both put the
// machine into sleeping, since Decaid 0.8.8 has no state that switches the DE1 off (research.md
// 22): machine sleep keeps the app awake and 'Wake machine' wakes it; machine and app sleep shows
// the Asleep screen, dimmed to 5 where the platform can, until a touch. Neither changes Decaid's
// keepAwake or wake lock. The tests leave the steam temperature, the machine's state, keepAwake,
// the wake lock, the brightness and the skin's KV backup as they found them. The same with a
// mocked gateway: e2e/menu-shortcuts.spec.ts.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/pureflow/settings-backup';

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
const workflowSteam = async (): Promise<number> => (await api<RigWorkflow>('GET', '/api/v1/workflow')).steamSettings.targetTemperature;

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
      resolve((JSON.parse(String(event.data)) as ShotSettings).targetSteamTemp);
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

test('home menu: steam off and on again, read back from the machine; machine sleep keeps the app awake (item 18, 56)', async ({
  page,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const temperatureBefore = await workflowSteam();
  const machineBefore = await machineSteamTemp();
  const backupBefore = await api('GET', BACKUP);
  const displayBefore = await api<DisplayState>('GET', '/api/v1/display');
  const keepAwakeBefore = (await api<DecaidSettings>('GET', '/api/v1/settings')).keepAwake;
  expect(temperatureBefore, 'the rig starts with the steam heater on').toBeGreaterThanOrEqual(135);

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });

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

    await expect(page.getByTestId('machine-sleep')).toHaveText('Machine sleep');
    await expect(page.getByTestId('machine-sleep-detail')).toHaveCount(0);
    await page.getByTestId('machine-sleep').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('sleeping');
    await expect(page.getByTestId('status-title')).toHaveText('Asleep', { timeout: 15_000 });
    // The app stays awake: no Asleep screen, the screen not dimmed.
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId('asleep')).toHaveCount(0);
    // Decaid 0.8.8 itself lowers the screen to 10 while the machine sleeps (seen 2026-10-21 with the skin
    // closed); the skin's own dimming is 5 (Asleep screen) or 0, which 'Machine sleep' must not set.
    const dimmed = (await api<DisplayState>('GET', '/api/v1/display')).requestedBrightness;
    expect([displayBefore.requestedBrightness, 10]).toContain(dimmed);
    await page.screenshot({ path: 'e2e-rig/.results/machine-sleep-rig.png' });
    await page.getByTestId('menu').click();
    await page.getByTestId('wake-machine').click();
    await expect.poll(machineState, { timeout: 15_000 }).not.toBe('sleeping');
    await expect(page.getByTestId('status-title')).not.toHaveText('Asleep', { timeout: 15_000 });
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
  expect((await api<DecaidSettings>('GET', '/api/v1/settings')).keepAwake).toBe(keepAwakeBefore);
  const displayAfter = await api<DisplayState>('GET', '/api/v1/display');
  expect([displayAfter.wakeLockOverride, displayAfter.requestedBrightness]).toEqual([
    displayBefore.wakeLockOverride,
    displayBefore.requestedBrightness,
  ]);
  expect(await api('GET', BACKUP)).toEqual(backupBefore);
});

test('home menu: machine and app sleep shows the Asleep screen at 5, a touch wakes; keepAwake and the wake lock untouched (item 56)', async ({
  page,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const displayBefore = await api<DisplayState>('GET', '/api/v1/display');
  const keepAwakeBefore = (await api<DecaidSettings>('GET', '/api/v1/settings')).keepAwake;
  const backupBefore = await api('GET', BACKUP);
  expect(displayBefore.wakeLockEnabled, 'the rig holds the wake lock while the machine is awake').toBe(true);
  const sent: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && /^\/api\/v1\/(machine\/state\/|display\/|settings$)/.test(path)) {
      sent.push(`${request.method()} ${path}${request.postData() ? ` ${request.postData()}` : ''}`);
    }
  });

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });
    await page.getByTestId('menu').click();
    await expect(page.getByTestId('app-sleep')).toHaveText('Machine and app sleep');
    await expect(page.getByTestId('app-sleep-detail')).toHaveCount(0);
    await page.getByTestId('app-sleep').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('sleeping');
    await expect(page.getByTestId('asleep')).toBeVisible({ timeout: 15_000 });

    // Asleep: the screen at 5 where the platform can dim; keepAwake and the override untouched.
    if (displayBefore.platformSupported?.brightness === true) {
      await expect
        .poll(async () => (await api<DisplayState>('GET', '/api/v1/display')).requestedBrightness, { timeout: 15_000 })
        .toBe(5);
    }
    await page.waitForTimeout(2_000);
    expect((await api<DisplayState>('GET', '/api/v1/display')).wakeLockOverride).toBe(displayBefore.wakeLockOverride);
    expect((await api<DecaidSettings>('GET', '/api/v1/settings')).keepAwake).toBe(keepAwakeBefore);

    await page.touchscreen.tap(1200, 760);
    await expect.poll(machineState, { timeout: 15_000 }).not.toBe('sleeping');
    await expect(page.getByTestId('asleep')).toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () => {
        const display = await api<DisplayState>('GET', '/api/v1/display');
        return [display.wakeLockEnabled, display.wakeLockOverride, display.requestedBrightness];
      })
      .toEqual([displayBefore.wakeLockEnabled, displayBefore.wakeLockOverride, displayBefore.requestedBrightness]);
    // Every request answered (the page logs none that failed), in this order.
    const brightness = (value: number) =>
      displayBefore.platformSupported?.brightness === true ? [`PUT /api/v1/display/brightness {"brightness":${value}}`] : [];
    expect(sent).toEqual([
      'PUT /api/v1/machine/state/sleeping',
      ...brightness(5),
      'PUT /api/v1/machine/state/idle',
      ...brightness(100),
    ]);
    // The rig drops the scale while the machine sleeps (research.md 13): the next test needs it.
    await expect(page.getByTestId('state-scale')).toHaveText(/ g$/, { timeout: 30_000 });
  } finally {
    if ((await machineState().catch(() => undefined)) === 'sleeping') await api('PUT', '/api/v1/machine/state/idle');
    if ((await api<DecaidSettings>('GET', '/api/v1/settings')).keepAwake !== keepAwakeBefore) {
      await api('POST', '/api/v1/settings', { keepAwake: keepAwakeBefore });
    }
    if ((await api<DisplayState>('GET', '/api/v1/display')).wakeLockOverride !== displayBefore.wakeLockOverride) {
      await api(displayBefore.wakeLockOverride ? 'POST' : 'DELETE', '/api/v1/display/wakelock');
    }
    if (displayBefore.platformSupported?.brightness === true) {
      await api('PUT', '/api/v1/display/brightness', { brightness: displayBefore.requestedBrightness ?? 100 });
    }
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
    else await api('POST', BACKUP, backupBefore);
  }

  expect(await machineState()).not.toBe('sleeping');
  expect((await api<DecaidSettings>('GET', '/api/v1/settings')).keepAwake).toBe(keepAwakeBefore);
  const displayAfter = await api<DisplayState>('GET', '/api/v1/display');
  expect([displayAfter.wakeLockOverride, displayAfter.requestedBrightness]).toEqual([
    displayBefore.wakeLockOverride,
    displayBefore.requestedBrightness,
  ]);
  expect(await api('GET', BACKUP)).toEqual(backupBefore);
});
