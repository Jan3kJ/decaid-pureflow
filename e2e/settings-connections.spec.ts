import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// The settings page's Connections, Maintenance and Machine Information (spec 3.7 'Settings',
// research.md 20.10 S2b), against the mocked gateway and its `/ws/v1/devices` frames: the
// device lists as the frames change, scan, connect, preferred, forget, the scale's power mode
// and 'scale required'; a clean started after its confirm and cancelled. The same against the
// running gateway: e2e-rig/settings-connections.spec.ts.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    // A connect that times out is a 504 the browser logs by itself.
    if (message.type() === 'error' && !/50[04] \(/.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openCategory(page: Page, id: string) {
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId(`settings-category-${id}`).click();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', id);
}

const writes = (method: string, path: string) => gateway.calls(method, path).map((call) => call.body);
const machines = (page: Page) => page.getByTestId('devices-machine').locator('.device');
const scales = (page: Page) => page.getByTestId('devices-scale').locator('[data-state]');

/** Nothing reaches over the viewport's width, and the page itself does not scroll. */
async function fitsWidth(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const wide = [...document.querySelectorAll('button, section, header, nav, input')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 0.5);
    });
    return { scrollsX: root.scrollWidth > innerWidth, scrollsY: root.scrollHeight > innerHeight, wide: wide.length };
  });
}

test("the device lists show Decaid's frames: connected first, the preferred one switched on, an absent one last", async ({ page }) => {
  await openCategory(page, 'bluetooth');
  await expect(machines(page)).toHaveCount(1);
  await expect(page.getByTestId('device-state-MockDe1')).toHaveText('Connected');
  await expect(page.getByTestId('device-preferred-MockDe1')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('device-disconnect-MockDe1')).toBeVisible();
  await expect(scales(page)).toHaveCount(1);
  await expect(page.getByTestId('device-state-MockScale')).toHaveText('Connected');

  // A frame: a remembered scale that is absent, and one found, listed before it.
  gateway.devices = [
    { name: 'Old Scale', id: 'AA:BB:CC:00:00:01', state: 'disconnected', type: 'scale', available: false },
    ...gateway.devices,
    { name: 'Decent Scale', id: 'AA:BB:CC:00:00:02', state: 'discovered', type: 'scale', available: true },
  ];
  gateway.sendDevices();
  await expect(scales(page)).toHaveCount(3);
  expect(await scales(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-state')))).toEqual([
    'connected',
    'available',
    'unavailable',
  ]);
  await expect(page.getByTestId('device-state-AA:BB:CC:00:00:01')).toHaveText('Unavailable');
  await expect(page.getByTestId('device-rescan-AA:BB:CC:00:00:01')).toBeVisible();
  await expect(page.getByTestId('device-forget-AA:BB:CC:00:00:01')).toBeVisible();
  await expect(page.getByTestId('device-connect-AA:BB:CC:00:00:02')).toBeVisible();
  // The machine list has machines only.
  await expect(machines(page)).toHaveCount(1);

  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
  await page.screenshot({ path: 'docs/product/settings-connections.png' });
});

test('Search scans with connect and quick; the scan and what it found come as frames; Connect sends the id in the body', async ({
  page,
}) => {
  gateway.scanFinds = [{ name: 'Decent Scale', id: 'AA:BB:CC:00:00:02', state: 'discovered', type: 'scale', available: true }];
  await openCategory(page, 'bluetooth');
  await expect(scales(page)).toHaveCount(1);

  await page.getByTestId('devices-scan-scale').click();
  await expect(page.getByTestId('devices-scale')).toContainText('Searching…');
  await expect(page.getByTestId('device-state-AA:BB:CC:00:00:02')).toHaveText('Available');
  await expect(page.getByTestId('devices-scale')).not.toContainText('Searching…');
  expect(gateway.requests.filter((request) => request.path === '/api/v1/devices/scan')).toHaveLength(1);
  expect(gateway.calls('GET', '/api/v1/devices/scan')).toHaveLength(1);

  await page.getByTestId('device-connect-AA:BB:CC:00:00:02').click();
  await expect(page.getByTestId('device-state-AA:BB:CC:00:00:02')).toHaveText('Connected');
  expect(writes('PUT', '/api/v1/devices/connect')).toEqual([{ deviceId: 'AA:BB:CC:00:00:02' }]);

  // Disconnect, then a connect that times out says so on its row.
  await page.getByTestId('device-disconnect-AA:BB:CC:00:00:02').click();
  await expect(page.getByTestId('device-state-AA:BB:CC:00:00:02')).toHaveText('Available');
  expect(writes('PUT', '/api/v1/devices/disconnect')).toEqual([{ deviceId: 'AA:BB:CC:00:00:02' }]);
  gateway.connectTimesOut.add('AA:BB:CC:00:00:02');
  await page.getByTestId('device-connect-AA:BB:CC:00:00:02').click();
  await expect(page.getByTestId('device-message-AA:BB:CC:00:00:02')).toHaveText('The connection timed out.');
});

test('the preferred switch writes preferredScaleId and shows what Decaid read back; off writes null', async ({ page }) => {
  gateway.devices = [
    ...gateway.devices,
    { name: 'Decent Scale', id: 'AA:BB:CC:00:00:02', state: 'discovered', type: 'scale', available: true },
  ];
  await openCategory(page, 'bluetooth');
  const other = page.getByTestId('device-preferred-AA:BB:CC:00:00:02');
  await expect(other).toHaveAttribute('aria-checked', 'false');
  await other.click();
  await expect(other).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('device-preferred-MockScale')).toHaveAttribute('aria-checked', 'false');
  await other.click();
  await expect(other).toHaveAttribute('aria-checked', 'false');
  expect(writes('POST', '/api/v1/settings')).toEqual([{ preferredScaleId: 'AA:BB:CC:00:00:02' }, { preferredScaleId: null }]);
  expect(gateway.decaidSettings.preferredScaleId).toBeNull();
});

test('Forget asks first and sends the id; the absent device leaves the list', async ({ page }) => {
  gateway.devices = [
    ...gateway.devices,
    { name: 'Old Scale', id: 'AA:BB:CC:00:00:01', state: 'disconnected', type: 'scale', available: false },
  ];
  await openCategory(page, 'bluetooth');
  await page.getByTestId('device-forget-AA:BB:CC:00:00:01').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('Forget Old Scale?');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('PUT', '/api/v1/devices/forget')).toHaveLength(0);

  await page.getByTestId('device-forget-AA:BB:CC:00:00:01').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('device-AA:BB:CC:00:00:01')).toHaveCount(0);
  expect(writes('PUT', '/api/v1/devices/forget')).toEqual([{ deviceId: 'AA:BB:CC:00:00:01' }]);

  // Reconnect of an absent one is a scan that connects.
  gateway.devices = [
    ...gateway.devices,
    { name: 'Old Scale', id: 'AA:BB:CC:00:00:01', state: 'disconnected', type: 'scale', available: false },
  ];
  gateway.sendDevices();
  await page.getByTestId('device-rescan-AA:BB:CC:00:00:01').click();
  await expect.poll(() => gateway.requests.filter((request) => request.path === '/api/v1/devices/scan').length).toBe(1);
});

test("a list from Decaid that comes before Forget's answer is kept: the device found again stays", async ({ page }) => {
  gateway.devices = [
    ...gateway.devices,
    { name: 'Old Scale', id: 'AA:BB:CC:00:00:01', state: 'disconnected', type: 'scale', available: false },
  ];
  await openCategory(page, 'bluetooth');
  // Decaid finds the scale again and sends its list while the forget is out; the answer comes after it.
  await page.route('**/api/v1/devices/forget', async (route) => {
    gateway.devices = gateway.devices.map((entry) =>
      entry.id === 'AA:BB:CC:00:00:01' ? { ...entry, state: 'discovered', available: true } : entry,
    );
    gateway.sendDevices();
    await expect(page.getByTestId('device-connect-AA:BB:CC:00:00:01')).toBeVisible();
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  const answered = page.waitForResponse('**/api/v1/devices/forget');
  await page.getByTestId('device-forget-AA:BB:CC:00:00:01').click();
  await page.getByTestId('settings-confirm-ok').click();
  await answered;
  // The answer's continuation runs before the next frame is drawn.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.getByTestId('device-connect-AA:BB:CC:00:00:01').click();
  await expect.poll(() => writes('PUT', '/api/v1/devices/connect')).toEqual([{ deviceId: 'AA:BB:CC:00:00:01' }]);
});

test("the scale's power mode and 'scale required' are Decaid's settings, written alone and read back", async ({ page }) => {
  await openCategory(page, 'bluetooth');
  await expect(page.getByTestId('setting-scale-power-mode-disconnect')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('setting-scale-power-mode-displayOff').click();
  await expect(page.getByTestId('setting-scale-power-mode-displayOff')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('setting-block-on-no-scale')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('setting-block-on-no-scale').click();
  await expect(page.getByTestId('setting-block-on-no-scale')).toHaveAttribute('aria-checked', 'true');
  expect(writes('POST', '/api/v1/settings')).toEqual([{ scalePowerMode: 'displayOff' }, { blockOnNoScale: true }]);
  expect(gateway.decaidSettings).toMatchObject({ scalePowerMode: 'displayOff', blockOnNoScale: true });
});

test('a Wi-Fi scale is added by its address and removed', async ({ page }) => {
  await openCategory(page, 'bluetooth');
  await page.getByTestId('wifi-add').click();
  await expect(page.getByTestId('wifi-message')).toHaveText('Enter an IP address or a host name.');
  await page.getByTestId('wifi-host').fill('hds.local');
  await page.getByTestId('wifi-add').click();
  await expect(page.getByTestId('wifi-remove-hds.local')).toBeVisible();
  await page.getByTestId('wifi-remove-hds.local').click();
  await expect(page.getByTestId('wifi-remove-hds.local')).toHaveCount(0);
  expect(writes('POST', '/api/v1/devices/wifi')).toEqual([{ host: 'hds.local' }]);
  expect(writes('DELETE', '/api/v1/devices/wifi')).toEqual([{ host: 'hds.local' }]);
  expect(gateway.wifi).toEqual([]);
});

test('a clean starts after its confirm with PUT .../state/cleaning, and Cancel sends .../idle', async ({ page }) => {
  await openCategory(page, 'maintenance');
  const states = () => gateway.calls('PUT', /^\/api\/v1\/machine\/state\//).map((call) => call.path.split('/').pop());

  // The confirm's Cancel sends nothing.
  await page.getByTestId('maintenance-start-clean').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('blind basket');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(states()).toEqual([]);

  await page.getByTestId('maintenance-start-clean').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect.poll(states).toEqual(['cleaning']);
  // The machine's frames say cleaning: the procedure runs, at its first step.
  await expect(page.getByTestId('maintenance-caption-clean')).toHaveText('Starting');
  await expect(page.getByTestId('maintenance-cancel-clean')).toBeVisible();
  await expect.poll(() => gateway.state).toBe('cleaning');
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
  await page.screenshot({ path: 'docs/product/settings-maintenance.png' });

  await page.getByTestId('maintenance-cancel-clean').click();
  await expect.poll(states).toEqual(['cleaning', 'idle']);
  await expect(page.getByTestId('maintenance-start-clean')).toBeVisible();
  await expect(page.getByTestId('maintenance-caption-clean')).toHaveCount(0);
  expect(gateway.state).toBe('idle');
});

test('a clean the machine already runs is shown; it is done when the machine leaves it', async ({ page }) => {
  gateway.state = 'cleaning';
  gateway.substate = 'cleanSoaking';
  await openCategory(page, 'maintenance');
  await expect(page.getByTestId('maintenance-caption-clean')).toHaveText('Soak');
  gateway.state = 'idle';
  gateway.substate = null;
  await expect(page.getByTestId('maintenance-caption-clean')).toHaveText('Ready');
  await expect(page.getByTestId('maintenance-start-clean')).toBeVisible();
});

test('out of water, Start says so and asks nothing', async ({ page }) => {
  await openCategory(page, 'maintenance');
  gateway.state = 'needsWater';
  // The next frame of the machine says so.
  await page.waitForTimeout(700);
  await page.getByTestId('maintenance-start-clean').click();
  await expect(page.getByTestId('maintenance-message-clean')).toContainText('Out of water');
  await expect(page.getByTestId('settings-confirm')).toHaveCount(0);
  expect(gateway.calls('PUT', /^\/api\/v1\/machine\/state\//)).toHaveLength(0);
});

test("Machine Information shows the machine's model, firmware and serial; the charging status only where Decaid reports one", async ({
  page,
}) => {
  await openCategory(page, 'machine');
  await expect(page.getByTestId('machine-info-model')).toHaveText('DE1Pro');
  await expect(page.getByTestId('machine-info-firmware')).toHaveText('1337');
  await expect(page.getByTestId('machine-info-serial')).toHaveText('mock-de1');
  await expect(page.getByTestId('machine-info')).toContainText('Refill kit');
  await expect(page.getByTestId('charging-status')).toHaveCount(0);

  gateway.decaidSettings = {
    ...gateway.decaidSettings,
    chargingState: { batteryPercent: 64, isEmergency: false, currentPhase: 'hovering', usbChargerOn: true },
  };
  await page.reload();
  await expect(page.getByTestId('charging-status')).toContainText('64%');
  await expect(page.getByTestId('charging-status')).toContainText('Hovering');
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
});

test('without a machine, Machine Information says it was not read and reads again', async ({ page }) => {
  gateway.machineConnected = false;
  await openCategory(page, 'machine');
  await expect(page.getByTestId('machine-info-error')).toContainText('not connected');
  gateway.machineConnected = true;
  await page.getByTestId('machine-info-error').getByRole('button', { name: 'Read again' }).click();
  await expect(page.getByTestId('machine-info-model')).toHaveText('DE1Pro');
});
