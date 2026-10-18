import { expect, test, type Page } from '@playwright/test';

// The hot water page against the rig (R5, spec 3.7, acceptance item 20). A short simulated
// shot is pulled and its recorded yield set to 40 g, so the newest shot weighs 40 g; the split
// tab opens the page, 1:2 sets 80 g, and the four values land in the workflow's hotWaterData.
// Hot water is then asked for through the API, as the DE1's own button would (the skin starts
// nothing): Decaid tares the mock scale and stops it at the weight, long before its duration
// (research.md 21). Last, the page's tare button tares the scale. The test deletes the shot,
// puts the workflow back and leaves the skin's KV namespace as it was.

const GATEWAY = 'http://localhost:8080';
const PROFILE = 'Rao Allongé';
const SHOT_GRAMS = 40;
const BACKUP = '/api/v1/store/pureflow/settings-backup';

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
const shotIds = (): Promise<string[]> => api('GET', '/api/v1/shots/ids');
const hotWaterData = async () => (await api('GET', '/api/v1/workflow')).hotWaterData;

/** Types a value on the number pad that a tap on `testid` opens. */
async function type(page: Page, testid: string, value: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('the hot water page writes hotWaterData, 1:2 of a 40 g shot is 80 g, Decaid stops at it, tare tares', async ({
  page,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflowBefore = await api('GET', '/api/v1/workflow');
  const shotsBefore = await shotIds();
  const backupBefore = await api('GET', BACKUP);
  const profiles: { profile: { title: string } }[] = await api('GET', '/api/v1/profiles');
  const shotProfile = profiles.find((record) => record.profile.title === PROFILE)!.profile;

  try {
    // A short simulated shot, stopped by Decaid at 3 g; then its recorded yield is 40 g.
    await api('PUT', '/api/v1/workflow', { profile: shotProfile, context: { targetYield: 3 } });
    await api('PUT', '/api/v1/machine/state/espresso');
    await expect.poll(machineState, { timeout: 15_000, intervals: [200] }).toBe('espresso');
    await expect.poll(machineState, { timeout: 60_000, intervals: [300] }).not.toBe('espresso');
    let shotId: string | undefined;
    await expect
      .poll(async () => (shotId = (await shotIds()).find((id) => !shotsBefore.includes(id))), { timeout: 30_000 })
      .toBeTruthy();
    const shot = await api('GET', `/api/v1/shots/${encodeURIComponent(shotId!)}`);
    await api('PUT', `/api/v1/shots/${encodeURIComponent(shotId!)}`, {
      annotations: { ...shot.annotations, actualYield: SHOT_GRAMS },
    });
    expect((await api('GET', '/api/v1/shots/latest')).annotations.actualYield).toBe(SHOT_GRAMS);

    // The split tab's hot water part opens the page.
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 30_000 });
    await page.getByTestId('open-hot-water').click();
    await expect(page.getByTestId('screen-hot-water')).toBeVisible();
    await expect(page.getByTestId('hot-water-last-shot')).toHaveText('40.0 g');
    // The favourites are the settings' defaults.
    await expect(page.getByTestId('hot-water-ratio')).toHaveText(['1:2 80 g', '1:2.5 100 g', '1:3 120 g']);

    // 1:2 of 40 g: 80 g in hotWaterData.volume; temperature, flow and time beside it.
    await page.getByTestId('hot-water-ratio').first().click();
    await expect.poll(async () => (await hotWaterData()).volume).toBe(80);
    await type(page, 'hot-water-temperature', '80');
    await type(page, 'hot-water-flow', '4');
    await type(page, 'hot-water-time', '60');
    await expect
      .poll(hotWaterData)
      .toEqual({ targetTemperature: 80, duration: 60, volume: 80, flow: 4 });
    await expect(page.getByTestId('hot-water-weight')).toContainText('80g');
    await page.screenshot({ path: 'e2e-rig/.results/hot-water-rig.png' });

    // Hot water, started as at the machine: Decaid tares the scale and stops at 80 g. At
    // 4 ml/s that is about 20 s; the duration of 60 s would be the stop without the weight.
    await api('PUT', '/api/v1/machine/state/hotWater');
    await expect.poll(machineState, { timeout: 10_000, intervals: [200] }).toBe('hotWater');
    const started = Date.now();
    await expect.poll(machineState, { timeout: 70_000, intervals: [300] }).not.toBe('hotWater');
    const seconds = (Date.now() - started) / 1000;
    expect(seconds).toBeLessThan(40);
    await page.waitForTimeout(1500);
    const weighed = parseFloat((await page.getByTestId('hot-water-scale').textContent()) ?? '');
    expect(weighed).toBeGreaterThan(75);
    expect(weighed).toBeLessThan(85);
    console.log(`hot water stopped after ${seconds.toFixed(1)} s at ${weighed} g`);

    // The tare button tares.
    await page.getByTestId('hot-water-tare').click();
    await expect
      .poll(async () => Math.abs(parseFloat((await page.getByTestId('hot-water-scale').textContent()) ?? '')))
      .toBeLessThan(1);
  } finally {
    if (['espresso', 'hotWater'].includes(await machineState().catch(() => ''))) {
      await api('PUT', '/api/v1/machine/state/idle');
    }
    await page.waitForTimeout(3000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
    }
    await api('PUT', '/api/v1/workflow', {
      profile: workflowBefore.profile,
      context: { targetYield: workflowBefore.context?.targetYield ?? 0 },
      hotWaterData: workflowBefore.hotWaterData,
    });
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
  }
  expect(await shotIds()).toEqual(shotsBefore);
  expect((await api('GET', '/api/v1/workflow')).hotWaterData).toEqual(workflowBefore.hotWaterData);
});
