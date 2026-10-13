import { expect, test } from '@playwright/test';

// The steam page against the rig (D8a): the duration the skin writes can be read back from
// the running gateway, and steam starts and is stopped by the skin's stop button. Only the
// scale's frames are the test's: the simulated scale's weight cannot be set (research.md
// 8.7). Simulated steam does not end by itself, so the timer running out is not checked.
// The test deletes the steam record it creates and puts the steam timer back.

const GATEWAY = 'http://localhost:8080';
/** A medium mug of 225 g with 180 g of milk: 26 s with the founder's defaults. */
const WEIGHT = 405;
const SECONDS = 26;

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

const steamIds = (): Promise<string[]> => api('GET', '/api/v1/steams/ids');
const steamSettings = async () => (await api('GET', '/api/v1/workflow')).steamSettings;
const machineState = async () => (await api('GET', '/api/v1/machine/state')).state.state;

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('steam: the written timer is read back from the gateway, steam starts and the stop button ends it', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const before = await steamSettings();
  const steamsBefore = await steamIds();
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(GATEWAY) && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
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

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 15_000 });
    await page.getByTestId('open-steam').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${before.duration}s`);

    // A favourite chip, one that changes the timer: the gateway has its seconds.
    const chips = page.getByTestId('steam-favourite');
    const favourites = (await chips.allTextContents()).map((text) => parseInt(text, 10));
    const favourite = favourites.findIndex((seconds) => seconds !== before.duration && seconds !== SECONDS);
    await chips.nth(favourite).click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${favourites[favourite]}s`);
    expect(await steamSettings()).toEqual({ ...before, duration: favourites[favourite] });

    // The timer from the milk's weight.
    await expect(page.getByTestId('steam-mug')).toHaveText('m');
    await expect(page.getByTestId('steam-milk')).toHaveText('180 g');
    await expect(page.getByTestId('steam-seconds')).toHaveText(`${SECONDS} s`);
    await page.getByTestId('steam-set-timer').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${SECONDS}s`);
    expect(await steamSettings()).toEqual({ ...before, duration: SECONDS });

    // Steam starts; the page shows the machine's state and draws its frames.
    await page.getByTestId('steam-start').click();
    await expect(page.getByTestId('steam-stop')).toBeVisible({ timeout: 15_000 });
    expect(await machineState()).toBe('steam');
    await expect
      .poll(async () => Number(await page.getByTestId('shot-graph').getAttribute('data-points')), { timeout: 15_000 })
      .toBeGreaterThan(5);
    await expect(page.getByTestId('steam-state')).toContainText('steaming');
    await page.screenshot({ path: 'e2e-rig/.results/steam-rig.png' });

    // The skin's stop button ends it.
    await page.getByTestId('steam-stop').click();
    await expect(page.getByTestId('steam-start')).toBeEnabled({ timeout: 30_000 });
    expect(await machineState()).toBe('idle');
    await expect(page.getByTestId('steam-state')).toContainText('last steam');

    expect(sent).toEqual([
      `PUT /api/v1/workflow {"steamSettings":{"duration":${favourites[favourite]}}}`,
      `PUT /api/v1/workflow {"steamSettings":{"duration":${SECONDS}}}`,
      'PUT /api/v1/machine/state/steam',
      'PUT /api/v1/machine/state/idle',
    ]);
  } finally {
    if ((await machineState().catch(() => undefined)) === 'steam') await api('PUT', '/api/v1/machine/state/idle');
    // The record of a steam is written when the machine has left steam.
    await page.waitForTimeout(3000);
    for (const id of await steamIds()) {
      if (!steamsBefore.includes(id)) await api('DELETE', `/api/v1/steams/${encodeURIComponent(id)}`);
    }
    await api('PUT', '/api/v1/workflow', { steamSettings: { duration: before.duration } });
  }

  expect(await steamIds()).toEqual(steamsBefore);
  expect(await steamSettings()).toEqual(before);
});
