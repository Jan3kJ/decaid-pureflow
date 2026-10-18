import { expect, test, type Page } from '@playwright/test';

// The ported settings page against the rig (acceptance 22, research.md 20.10 S2a): Decaid's
// settings changed through the page are read back from the running gateway, and the flush's
// flow and duration (founder, 2026-10-17) reach the workflow and the machine. The test records
// every value it changes before it starts, puts each back and checks them afterwards, and puts
// back Streamline's remembered values (research.md 16) and the skin's KV backup as it found
// them. Without a gateway: e2e/settings-page.spec.ts.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/decaid-skin/settings-backup';
/** Streamline's keys the page moves with its values, where Streamline has them */
const STREAMLINE_KEYS = ['last-steam-flow', 'last-flush-duration'];

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

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

/** Types a value on the number pad that a tap on `testid` opens. */
async function type(page: Page, testid: string, value: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

/** Everything the test may change, as the gateway holds it. */
async function snapshot() {
  const [settings, machine, advanced, workflow] = await Promise.all([
    api('GET', '/api/v1/settings'),
    api('GET', '/api/v1/machine/settings'),
    api('GET', '/api/v1/machine/settings/advanced'),
    api('GET', '/api/v1/workflow'),
  ]);
  const streamline = Object.fromEntries(
    await Promise.all(STREAMLINE_KEYS.map(async (key) => [key, await api('GET', `/api/v1/store/streamline-app/${key}`)])),
  );
  return {
    weightFlowMultiplier: settings.weightFlowMultiplier,
    stopHotWaterAtWeight: settings.stopHotWaterAtWeight,
    steamPurgeMode: machine.steamPurgeMode,
    flushFlow: machine.flushFlow,
    heaterIdleTemp: advanced.heaterIdleTemp,
    steamSettings: workflow.steamSettings,
    rinseData: workflow.rinseData,
    streamline,
    backup: await api('GET', BACKUP),
  };
}

test('settings changed through the page are read back from the gateway, and restored (acceptance 22)', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const before = await snapshot();
  console.log('before', JSON.stringify(before));
  // The values the test sets: each differs from the rig's.
  const multiplier = before.weightFlowMultiplier === 1.2 ? 1.3 : 1.2;
  const idle = before.heaterIdleTemp === 96 ? 95 : 96;
  const steamFlow = before.steamSettings.flow === 1.2 ? 1.3 : 1.2;
  const flushFlow = before.rinseData.flow === 4.5 ? 5.5 : 4.5;
  const flushDuration = before.rinseData.duration === 14 ? 13 : 14;
  const purge = before.steamPurgeMode === 1 ? 0 : 1;

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 15_000 });
    await page.getByTestId('menu').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-category-quickadjustments').click();
    const shown = (id: string) => page.getByTestId(`setting-${id}`).locator('b');
    await expect(shown('weight-flow-multiplier')).toHaveText(before.weightFlowMultiplier.toFixed(1));

    await type(page, 'setting-weight-flow-multiplier', String(multiplier));
    await expect(shown('weight-flow-multiplier')).toHaveText(multiplier.toFixed(1));
    expect((await api('GET', '/api/v1/settings')).weightFlowMultiplier).toBe(multiplier);

    await page.getByTestId(`setting-steam-purge-mode-${purge}`).click();
    await expect(page.getByTestId(`setting-steam-purge-mode-${purge}`)).toHaveAttribute('aria-pressed', 'true');
    expect((await api('GET', '/api/v1/machine/settings')).steamPurgeMode).toBe(purge);

    await type(page, 'setting-heater-idle-temperature', String(idle));
    await expect(shown('heater-idle-temperature')).toHaveText(`${idle}°C`);
    expect((await api('GET', '/api/v1/machine/settings/advanced')).heaterIdleTemp).toBe(idle);

    const stop = page.getByTestId('setting-stop-hot-water-at-weight');
    await expect(stop).toHaveAttribute('aria-checked', String(before.stopHotWaterAtWeight));
    await stop.click();
    await expect(stop).toHaveAttribute('aria-checked', String(!before.stopHotWaterAtWeight));
    expect((await api('GET', '/api/v1/settings')).stopHotWaterAtWeight).toBe(!before.stopHotWaterAtWeight);

    await type(page, 'setting-steam-flow', String(steamFlow));
    await expect(shown('steam-flow')).toHaveText(`${steamFlow.toFixed(1)}ml/s`);
    const steam = (await api('GET', '/api/v1/workflow')).steamSettings;
    expect(steam).toEqual({ ...before.steamSettings, flow: steamFlow });

    // The flush (founder, 2026-10-17): the workflow's rinseData, which Decaid writes to the
    // machine's flushFlow and flushTimeout; the simulated DE1 keeps the flow, not the time-out.
    await page.getByTestId('settings-sub-flush').click();
    await type(page, 'setting-flush-duration', String(flushDuration));
    await expect(shown('flush-duration')).toHaveText(`${flushDuration}s`);
    await type(page, 'setting-flush-flow', String(flushFlow));
    await expect(shown('flush-flow')).toHaveText(`${flushFlow.toFixed(1)}ml/s`);
    expect((await api('GET', '/api/v1/workflow')).rinseData).toEqual({ ...before.rinseData, duration: flushDuration, flow: flushFlow });
    expect((await api('GET', '/api/v1/machine/settings')).flushFlow).toBe(flushFlow);
  } finally {
    await api('POST', '/api/v1/settings', {
      weightFlowMultiplier: before.weightFlowMultiplier,
      stopHotWaterAtWeight: before.stopHotWaterAtWeight,
    });
    await api('POST', '/api/v1/machine/settings', { steamPurgeMode: before.steamPurgeMode });
    await api('POST', '/api/v1/machine/settings/advanced', { heaterIdleTemp: before.heaterIdleTemp });
    await api('PUT', '/api/v1/workflow', { steamSettings: { flow: before.steamSettings.flow }, rinseData: before.rinseData });
    for (const [key, value] of Object.entries(before.streamline)) {
      if (value === null || value === undefined) await api('DELETE', `/api/v1/store/streamline-app/${key}`);
      else await api('POST', `/api/v1/store/streamline-app/${key}`, value);
    }
    if (before.backup === null || before.backup === undefined) await api('DELETE', BACKUP);
    else await api('POST', BACKUP, before.backup);
  }

  // Everything as it was; the machine's flush flow follows the restored rinseData.
  const after = await snapshot();
  console.log('after', JSON.stringify(after));
  expect(after).toEqual(before);
});
