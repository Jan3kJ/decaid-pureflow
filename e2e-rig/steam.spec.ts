import { expect, test } from '@playwright/test';
import type { DisplayState, MachineSnapshot, WebUiServerStatus, ShotSettings } from '../src/api';
import { isWrite, type RigWorkflow } from './gateway';
import { IDLE } from './idle';
import { toPage } from '../e2e/touch';

// The steam page against the rig: the duration the skin writes can be read back from
// the running gateway, and steam starts and is stopped by the skin's stop button. Only the
// scale's frames are the test's: the simulated scale's weight cannot be set,
// and simulated steam does not end by itself, so the timer running out is not checked.
// The test deletes the steam record it creates and puts the steam timer back.
//
// Since a test on the tablet (25 s chosen, 30 s of steam)
// it reads the machine's own timer too, `targetSteamDuration` on `/ws/v1/machine/shotSettings`,
// and runs with Decaid's default skin, Streamline, open in a second page and remembering
// 30 s: without the skin's fix Streamline 0.2.13 writes its 30 s back over every timer the skin
// sets. 0.2.14 adopts another client's timer instead.

const GATEWAY = 'http://localhost:8080';
/** A medium mug of 225 g with two drinks, 300 g of milk: 43 s with the defaults. */
const WEIGHT = 525;
const SECONDS = 43;
/** Where Streamline remembers the steam time its user set. */
const STREAMLINE_STORE = '/api/v1/store/streamline-app';
const REMEMBERED = `${STREAMLINE_STORE}/last-steam-duration`;
const STREAMLINE_SECONDS = 30;
/** A timer nobody set: written to the machine past the workflow. */
const DRIFTED = 41;

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

const steamIds = (): Promise<string[]> => api('GET', '/api/v1/steams/ids');
const steamSettings = async () => (await api<RigWorkflow>('GET', '/api/v1/workflow')).steamSettings;
const machineState = async () => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state;

/** The settings the machine itself holds: the first frame of their stream. */
function machineSettings(): Promise<ShotSettings> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${GATEWAY.replace('http', 'ws')}/ws/v1/machine/shotSettings`);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('no frame of /ws/v1/machine/shotSettings in 10 s'));
    }, 10_000);
    socket.onmessage = (event) => {
      clearTimeout(timeout);
      socket.close();
      resolve(JSON.parse(String(event.data)) as ShotSettings);
    };
  });
}

/** The machine's own steam timer, in s. */
const machineTimer = async (): Promise<number> => (await machineSettings()).targetSteamDuration;

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('steam: the written timer is read back from the workflow and from the machine, with Streamline open; steam starts and the stop button ends it', async ({
  page,
  context,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const before = await steamSettings();
  const steamsBefore = await steamIds();
  const rememberedBefore = await api('GET', REMEMBERED);
  const storeBefore: string[] = await api('GET', STREAMLINE_STORE);
  // Streamline 0.2.17's page switches Decaid's wake lock override on.
  const wakeLockBefore = (await api<DisplayState>('GET', '/api/v1/display')).wakeLockOverride === true;
  const sent: string[] = [];
  page.on('request', (request) => {
    if (isWrite(request, GATEWAY)) {
      sent.push(`${request.method()} ${new URL(request.url()).pathname} ${request.postData() ?? ''}`.trim());
    }
  });
  // A mug with milk on the scale; everything else is the rig's.
  await page.routeWebSocket(/:8080\/ws\/v1\/scale\/snapshot/, (ws) => {
    ws.send(JSON.stringify({ status: 'connected' }));
    const frames = setInterval(() => {
      ws.send(JSON.stringify({ timestamp: new Date().toISOString(), weight: WEIGHT, weightFlow: 0, battery: 100, timerValue: null }));
    }, 250);
    ws.onClose(() => clearInterval(frames));
  });

  const streamline = await context.newPage();
  try {
    // Streamline as on the tablet: open, with a steam time of its own. The workflow
    // has the same seconds when it opens, so it has nothing to write back yet.
    await api('PUT', '/api/v1/workflow', { steamSettings: { duration: STREAMLINE_SECONDS } });
    await api('POST', REMEMBERED, STREAMLINE_SECONDS);
    const { port } = await api<WebUiServerStatus>('GET', '/api/v1/webui/server/status');
    await streamline.goto(`http://localhost:${port}/`);
    await streamline.waitForTimeout(8000);
    expect(await machineTimer()).toBe(STREAMLINE_SECONDS);

    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await toPage(page, 'steam');
    await expect(page.getByTestId('steam-timer')).toHaveText(`${STREAMLINE_SECONDS}s`);

    // A favourite chip, one that changes the timer: the workflow and the machine have its
    // seconds, and still have them when Streamline has had the time to answer.
    const chips = page.getByTestId('steam-favourite');
    const favourites = (await chips.allTextContents()).map((text) => parseInt(text, 10));
    const favourite = favourites.findIndex((seconds) => seconds !== STREAMLINE_SECONDS && seconds !== SECONDS);
    await chips.nth(favourite).click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${favourites[favourite]}s`);
    await page.waitForTimeout(4000);
    expect(await steamSettings()).toEqual({ ...before, duration: favourites[favourite] });
    expect(await machineTimer()).toBe(favourites[favourite]);
    await expect(page.getByTestId('steam-timer')).toHaveText(`${favourites[favourite]}s`);

    // The timer from the milk's weight.
    await expect(page.getByTestId('steam-mug')).toHaveText('m');
    await expect(page.getByTestId('steam-milk')).toHaveText('300 g');
    await expect(page.getByTestId('steam-seconds')).toHaveText(`${SECONDS} s`);
    await page.getByTestId('steam-set-timer').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${SECONDS}s`);
    await page.waitForTimeout(4000);
    expect(await steamSettings()).toEqual({ ...before, duration: SECONDS });
    expect(await machineTimer()).toBe(SECONDS);
    await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);

    // An adjust button: +5 s, the default third one, is in the seconds the
    // machine gets; selected again it is cleared.
    const adjust = page.getByTestId('steam-adjust');
    await expect(adjust).toHaveText(['−8 s', '−4 s', '+5 s']);
    await adjust.nth(2).click();
    await expect(page.getByTestId('steam-seconds')).toHaveText(`${SECONDS + 5} s`);
    await page.getByTestId('steam-set-timer').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${SECONDS + 5}s`);
    await page.waitForTimeout(4000);
    expect(await steamSettings()).toEqual({ ...before, duration: SECONDS + 5 });
    expect(await machineTimer()).toBe(SECONDS + 5);
    await adjust.nth(2).click();
    await page.getByTestId('steam-set-timer').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${SECONDS}s`);
    await page.waitForTimeout(4000);
    expect(await machineTimer()).toBe(SECONDS);

    // The machine's timer changes past the workflow, which keeps its seconds: the page shows
    // the machine's and says so. Decaid passes the same seconds on to no machine, so 'set
    // timer' writes the machine's settings itself.
    const settings = await machineSettings();
    await api('POST', REMEMBERED, DRIFTED);
    await api('POST', '/api/v1/machine/shotSettings', { ...settings, targetSteamDuration: DRIFTED });
    await expect(page.getByTestId('steam-timer')).toHaveText(`${DRIFTED}s`);
    await expect(page.getByTestId('steam-mismatch')).toContainText(`not the ${SECONDS} s set here`);
    expect((await steamSettings()).duration).toBe(SECONDS);
    await page.getByTestId('steam-set-timer').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${SECONDS}s`, { timeout: 10_000 });
    await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);
    expect(await machineTimer()).toBe(SECONDS);
    expect(await steamSettings()).toEqual({ ...before, duration: SECONDS });

    // Steam is started at the machine, here through the gateway as the removed start button
    // did; the page shows the machine's state and draws its frames.
    await expect(page.getByRole('button', { name: /start/ })).toHaveCount(0);
    await expect(page.getByTestId('state-tank')).toHaveText(/^\d*0 ml$/);
    const steamStarted = Date.now();
    await api('PUT', '/api/v1/machine/state/steam');
    await expect(page.getByTestId('steam-stop')).toBeVisible({ timeout: 15_000 });
    expect(await machineState()).toBe('steam');
    await expect
      .poll(async () => Number(await page.getByTestId('shot-graph').getAttribute('data-points')), { timeout: 15_000 })
      .toBeGreaterThan(5);
    // While steam runs 'steam left' is the one clock; the scale row is off.
    await expect(page.getByText('steam left')).toBeVisible();
    await expect(page.getByTestId('steam-state')).toHaveCount(0);
    await expect(page.getByTestId('steam-tare')).toBeDisabled();
    await page.screenshot({ path: 'e2e-rig/.results/steam-rig.png' });

    // The skin's stop button ends it.
    const steamWall = (Date.now() - steamStarted) / 1000;
    await page.getByTestId('steam-stop').click();
    await expect(page.getByTestId('steam-stop')).toHaveCount(0, { timeout: 30_000 });
    expect(await machineState()).toBe('idle');
    await expect(page.getByTestId('steam-state')).toContainText('last steam');
    // The simulated machine reports no `pouring` and no flow: its run is
    // from the first steam frame to the last (the fallback), so 'last steam' has
    // the seconds the machine steamed, no more.
    const lastSteam = parseInt((await page.getByTestId('steam-elapsed').textContent())!, 10);
    expect(lastSteam).toBeGreaterThanOrEqual(1);
    expect(lastSteam).toBeLessThanOrEqual(Math.ceil(steamWall) + 5);
    await expect(page.getByTestId('steam-timer')).toHaveText(`${SECONDS}s`);

    const remember = (seconds: number) => `POST ${REMEMBERED} ${seconds}`;
    const workflow = (seconds: number) => `PUT /api/v1/workflow {"steamSettings":{"duration":${seconds}}}`;
    expect(sent).toEqual([
      // Streamline's remembered steam time moves with the skin's, then the workflow is written.
      remember(favourites[favourite]),
      workflow(favourites[favourite]),
      remember(SECONDS),
      workflow(SECONDS),
      remember(SECONDS + 5),
      workflow(SECONDS + 5),
      remember(SECONDS),
      workflow(SECONDS),
      remember(SECONDS),
      workflow(SECONDS),
      `POST /api/v1/machine/shotSettings ${JSON.stringify({ ...settings, targetSteamDuration: SECONDS })}`,
      'PUT /api/v1/machine/state/idle',
    ]);

    // The control: Streamline is alive in its page. Its version 0.2.13 replaced a timer
    // written into the workflow alone by the seconds it remembered; 0.2.14
    // adopts it into its KV key instead and pushes nothing (`decideResync` in its
    // `resync-policy.js`). So the workflow and the machine keep 26 s, and
    // Streamline remembers 26 s.
    await api('PUT', '/api/v1/workflow', { steamSettings: { duration: 26 } });
    await expect.poll(() => api('GET', REMEMBERED), { timeout: 15_000 }).toBe(26);
    await streamline.waitForTimeout(5000);
    expect(await machineTimer()).toBe(26);
    expect((await steamSettings()).duration).toBe(26);
  } finally {
    await streamline.close();
    if ((await machineState().catch(() => undefined)) === 'steam') await api('PUT', '/api/v1/machine/state/idle');
    // The record of a steam is written when the machine has left steam.
    await page.waitForTimeout(3000);
    for (const id of await steamIds()) {
      if (!steamsBefore.includes(id)) await api('DELETE', `/api/v1/steams/${encodeURIComponent(id)}`);
    }
    // Streamline's store as it was: its remembered steam time, and no key its page added.
    if (rememberedBefore === null || rememberedBefore === undefined) await api('DELETE', REMEMBERED);
    else await api('POST', REMEMBERED, rememberedBefore);
    for (const key of await api<string[]>('GET', STREAMLINE_STORE)) {
      if (!storeBefore.includes(key)) await api('DELETE', `${STREAMLINE_STORE}/${encodeURIComponent(key)}`);
    }
    await api('PUT', '/api/v1/workflow', { steamSettings: before });
    if ((await api<DisplayState>('GET', '/api/v1/display')).wakeLockOverride !== wakeLockBefore) {
      await api(wakeLockBefore ? 'POST' : 'DELETE', '/api/v1/display/wakelock');
    }
  }

  expect(await steamIds()).toEqual(steamsBefore);
  expect(await steamSettings()).toEqual(before);
  expect(await machineTimer()).toBe(before.duration);
  expect(await api('GET', REMEMBERED)).toBe(rememberedBefore);
  expect(await api('GET', STREAMLINE_STORE)).toEqual(storeBefore);
  expect((await api<DisplayState>('GET', '/api/v1/display')).wakeLockOverride === true).toBe(wakeLockBefore);
});

test("steam: the page's tare button tares the simulated scale (item 17)", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const tares: number[] = [];
  page.on('response', (response) => {
    if (response.url() === `${GATEWAY}/api/v1/scale/tare`) tares.push(response.status());
  });
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
  await toPage(page, 'steam');
  // The simulated scale, its own frames: connected, with a weight.
  await expect(page.getByTestId('steam-tare')).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId('steam-weight')).toHaveText(/^-?\d+\.\d g$/);
  await page.getByTestId('steam-tare').click();
  await expect.poll(() => tares).toEqual([200]);
  await expect(page.getByTestId('steam-weight')).toHaveText(/^-?0\.\d g$/, { timeout: 5000 });
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('steam: with the heater off Steam on sits in the header and switches it on, read back from the machine', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const BACKUP = '/api/v1/store/pureflow/settings-backup';
  const temperatureBefore = (await steamSettings()).targetTemperature;
  const backupBefore = await api('GET', BACKUP);
  expect(temperatureBefore).toBeGreaterThanOrEqual(135);

  try {
    // Off as another client switches it: the workflow's 0, which Decaid writes to the machine.
    await api('PUT', '/api/v1/workflow', { steamSettings: { targetTemperature: 0 } });
    await expect.poll(async () => (await machineSettings()).targetSteamTemp, { timeout: 10_000 }).toBe(0);

    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });
    await toPage(page, 'steam');
    // In the header, left of the title; the favourites stay where they are.
    await expect(page.getByTestId('screen-steam').locator('.page-header').getByTestId('steam-heater-on')).toBeVisible();
    await expect(page.getByTestId('steam-favourite')).toHaveCount(3);
    // The state line says Off, not Idle, while the steam heater is off.
    const title = page.getByTestId('screen-steam').getByTestId('status-title');
    await expect(title).toHaveText('Off');
    await page.screenshot({ path: 'e2e-rig/.results/steam-heater-off-rig.png' });

    await page.getByTestId('steam-heater-on').click();
    await expect.poll(async () => (await steamSettings()).targetTemperature, { timeout: 10_000 }).toBe(temperatureBefore);
    await expect.poll(async () => (await machineSettings()).targetSteamTemp, { timeout: 10_000 }).toBe(temperatureBefore);
    await expect(page.getByTestId('steam-heater-on')).toHaveCount(0);
    await expect(page.getByTestId('steam-favourite')).toHaveCount(3);
    await expect(title).toHaveText(IDLE);
  } finally {
    await api('PUT', '/api/v1/workflow', { steamSettings: { targetTemperature: temperatureBefore } });
    await page.waitForTimeout(2000);
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
    else await api('POST', BACKUP, backupBefore);
  }
  expect((await steamSettings()).targetTemperature).toBe(temperatureBefore);
  expect((await machineSettings()).targetSteamTemp).toBe(temperatureBefore);
  expect(await api('GET', BACKUP)).toEqual(backupBefore);
});
