import { expect, test, type Page } from '@playwright/test';
import type { DisplayState, MachineSnapshot, PresenceSettings } from '../src/api';
import { IDLE } from './idle';

// The heartbeat against the rig: with the sleep after 1 min and presence on,
// a heartbeat answers the whole minute and -1 with presence off; a skin touched every 30 s for
// three minutes keeps the machine awake, at most one heartbeat every 30 s and never a write of
// the presence settings; left alone the machine sleeps after the minute. The test puts the
// presence settings, the machine's state and the screen's brightness (the Asleep screen dims it)
// back as it found them. The same with a mocked
// gateway: e2e/heartbeat.spec.ts.

const GATEWAY = 'http://localhost:8080';
const HEARTBEAT = '/api/v1/machine/heartbeat';

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok && response.status !== 404) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

const machineState = async (): Promise<string> => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).body.state.state;
const presence = async () => (await api<PresenceSettings>('GET', '/api/v1/presence/settings')).body;
const display = async () => (await api<DisplayState>('GET', '/api/v1/display')).body;

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

/** A touch on home that is not a control. */
async function touch(page: Page) {
  const home = page.getByTestId('screen-home');
  await home.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: 640, clientY: 400 });
  await home.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, clientX: 640, clientY: 400 });
}

test('a touched skin keeps the machine awake; left alone it sleeps after the minute (item 75)', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  const probe = await api('POST', HEARTBEAT);
  test.skip(probe.status === 404, `this Decaid has no ${HEARTBEAT} (it came with a later version than the rig's)`);
  test.setTimeout(480_000);

  const before = await presence();
  const displayBefore = await display();
  const heartbeats: number[] = [];
  let presenceWrites = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === HEARTBEAT) heartbeats.push(Date.now());
    if (request.method() !== 'GET' && path.startsWith('/api/v1/presence/')) presenceWrites++;
  });

  try {
    await api('POST', '/api/v1/presence/settings', { userPresenceEnabled: true, sleepTimeoutMinutes: 1 });
    expect((await api<{ timeout: number }>('POST', HEARTBEAT)).body.timeout).toBe(60);
    await api('POST', '/api/v1/presence/settings', { userPresenceEnabled: false });
    expect((await api<{ timeout: number }>('POST', HEARTBEAT)).body.timeout).toBe(-1);
    await api('POST', '/api/v1/presence/settings', { userPresenceEnabled: true });

    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });

    // Touched every 10 s for three minutes: awake throughout, a heartbeat at most every 30 s.
    const start = Date.now();
    while (Date.now() - start < 180_000) {
      await touch(page);
      expect(await machineState()).not.toBe('sleeping');
      await page.waitForTimeout(10_000);
    }
    expect(heartbeats.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < heartbeats.length; i++) expect(heartbeats[i] - heartbeats[i - 1]).toBeGreaterThanOrEqual(29_000);

    // Left alone: asleep within the minute after the last heartbeat (and a few seconds).
    const last = heartbeats[heartbeats.length - 1];
    await expect.poll(machineState, { timeout: 90_000, intervals: [1000] }).toBe('sleeping');
    const slept = (Date.now() - last) / 1000;
    expect(slept).toBeGreaterThan(50);
    expect(slept).toBeLessThan(75);
    await expect(page.getByTestId('asleep')).toBeVisible();
    const sent = heartbeats.length;
    await page.waitForTimeout(3000);
    expect(heartbeats.length, 'no heartbeat while the machine sleeps').toBe(sent);
    expect(presenceWrites, 'the skin never writes the presence settings').toBe(0);
  } finally {
    await api('POST', '/api/v1/presence/settings', {
      userPresenceEnabled: before.userPresenceEnabled,
      sleepTimeoutMinutes: before.sleepTimeoutMinutes,
    });
    if ((await machineState()) === 'sleeping') await api('PUT', '/api/v1/machine/state/idle');
    // the page undims when it sees the machine awake; a page closed before that leaves it dimmed
    if (displayBefore.platformSupported?.brightness === true) {
      await expect
        .poll(async () => (await display()).requestedBrightness, { timeout: 10_000 })
        .toBe(displayBefore.requestedBrightness)
        .catch(() => api('PUT', '/api/v1/display/brightness', { brightness: displayBefore.requestedBrightness ?? 100 }));
    }
  }
  const after = await presence();
  expect([after.userPresenceEnabled, after.sleepTimeoutMinutes]).toEqual([before.userPresenceEnabled, before.sleepTimeoutMinutes]);
  await expect.poll(machineState, { timeout: 30_000 }).toBe('idle');
  expect((await display()).requestedBrightness).toBe(displayBefore.requestedBrightness);
});
