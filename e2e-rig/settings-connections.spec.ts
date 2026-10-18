import { expect, test, type Page } from '@playwright/test';

// Connections, Maintenance and Machine Information against the rig (research.md 20.10 S2b):
// the device lists show the simulated MockDe1 and MockScale connected; the scale's power mode
// and 'scale required' changed through the page are read back from the gateway and restored;
// a clean is started and cancelled on the simulated DE1 and its state read back. No search,
// connect, disconnect or forget here: the rig's preferred devices stay, and a real DE1 nearby
// may be listed. The test records what it changes before and checks it afterwards. Without a
// gateway: e2e/settings-connections.spec.ts.

const GATEWAY = 'http://localhost:8080';
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

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

async function openCategory(page: Page, id: string) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle', { timeout: 15_000 });
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId(`settings-category-${id}`).click();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', id);
}

/** What the test may change or must not change, as the gateway holds it. */
async function snapshot() {
  const settings = await api('GET', '/api/v1/settings');
  const devices: any[] = await api('GET', '/api/v1/devices');
  return {
    scalePowerMode: settings.scalePowerMode,
    blockOnNoScale: settings.blockOnNoScale,
    preferredMachineId: settings.preferredMachineId,
    preferredScaleId: settings.preferredScaleId,
    connected: devices.filter((device) => device.state === 'connected').map((device) => device.id).sort(),
    wifi: await api('GET', '/api/v1/devices/wifi'),
    state: (await api('GET', '/api/v1/machine/state')).state,
    backup: await api('GET', BACKUP),
  };
}

test("the device lists show the rig's MockDe1 and MockScale connected; power mode and 'scale required' read back and restored", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const before = await snapshot();
  console.log('before', JSON.stringify(before));
  const mode = before.scalePowerMode === 'displayOff' ? 'disabled' : 'displayOff';

  try {
    await openCategory(page, 'bluetooth');
    await expect(page.getByTestId('device-state-MockDe1')).toHaveText('Connected');
    await expect(page.getByTestId('device-state-MockScale')).toHaveText('Connected');
    await expect(page.getByTestId('device-MockDe1')).toHaveAttribute('data-state', 'connected');
    await expect(page.getByTestId('devices-machine').getByTestId('device-MockScale')).toHaveCount(0);
    await expect(page.getByTestId('device-preferred-MockDe1')).toHaveAttribute('aria-checked', String(before.preferredMachineId === 'MockDe1'));
    await expect(page.getByTestId('device-preferred-MockScale')).toHaveAttribute('aria-checked', String(before.preferredScaleId === 'MockScale'));

    await page.getByTestId(`setting-scale-power-mode-${mode}`).click();
    await expect(page.getByTestId(`setting-scale-power-mode-${mode}`)).toHaveAttribute('aria-pressed', 'true');
    expect((await api('GET', '/api/v1/settings')).scalePowerMode).toBe(mode);

    const required = page.getByTestId('setting-block-on-no-scale');
    await expect(required).toHaveAttribute('aria-checked', String(before.blockOnNoScale));
    await required.click();
    await expect(required).toHaveAttribute('aria-checked', String(!before.blockOnNoScale));
    expect((await api('GET', '/api/v1/settings')).blockOnNoScale).toBe(!before.blockOnNoScale);
  } finally {
    await api('POST', '/api/v1/settings', { scalePowerMode: before.scalePowerMode, blockOnNoScale: before.blockOnNoScale });
    if (before.backup === null || before.backup === undefined) await api('DELETE', BACKUP);
    else await api('POST', BACKUP, before.backup);
  }

  const after = await snapshot();
  console.log('after', JSON.stringify(after));
  expect(after).toEqual(before);
});

test('a clean is started through the page and cancelled on the simulated DE1; the state is read back', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const before = await snapshot();
  expect(before.state.state).toBe('idle');
  const state = async () => (await api('GET', '/api/v1/machine/state')).state.state;

  try {
    await openCategory(page, 'maintenance');
    await page.getByTestId('maintenance-start-clean').click();
    await page.getByTestId('settings-confirm-ok').click();
    // The simulated DE1 enters cleaning (substate idle) and stays in it (research.md 20.14).
    await expect.poll(state, { timeout: 10_000 }).toBe('cleaning');
    await expect(page.getByTestId('maintenance-cancel-clean')).toBeVisible();
    await expect(page.getByTestId('maintenance-caption-clean')).toHaveText('Starting');

    await page.getByTestId('maintenance-cancel-clean').click();
    await expect.poll(state, { timeout: 10_000 }).toBe('idle');
    await expect(page.getByTestId('maintenance-start-clean')).toBeVisible();
  } finally {
    if ((await state()) !== 'idle') await api('PUT', '/api/v1/machine/state/idle');
    if (before.backup === null || before.backup === undefined) await api('DELETE', BACKUP);
    else await api('POST', BACKUP, before.backup);
  }
  await expect.poll(state, { timeout: 10_000 }).toBe('idle');
  expect(await snapshot()).toEqual(before);
});

test("Machine Information shows the simulated DE1's model, firmware and serial as the gateway reports them", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const info = await api('GET', '/api/v1/machine/info');
  await openCategory(page, 'machine');
  await expect(page.getByTestId('machine-info-model')).toHaveText(info.model);
  await expect(page.getByTestId('machine-info-firmware')).toHaveText(info.version);
  await expect(page.getByTestId('machine-info-serial')).toHaveText(info.serialNumber);
});
