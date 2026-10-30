import { expect, test, type Page } from '@playwright/test';
import type { Settings } from '../src/settings';
import type { Backup } from '../src/settings-backup';
import { mockGateway, type MockGateway } from './mock-gateway';
import { back } from './touch';

// The settings page ported from Streamline,
// against the mocked gateway: each category opens, a typed value is written with
// that key alone and the page shows what the next read returns, the confirms, the flush, and
// the skin's own settings in Skin. The same against the running gateway:
// e2e-rig/settings-page.spec.ts.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    // A refused write of one test is a 500 the browser logs by itself.
    if (message.type() === 'error' && !message.text().includes('500 (Internal Server Error)')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
}

/** Types a value on the number pad that a tap on `testid` opens. */
async function type(page: Page, testid: string, value: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

const shown = (page: Page, id: string) => page.getByTestId(`setting-${id}`).locator('b');
const writes = (method: string, path: string) => gateway.calls(method, path).map((call) => call.body);

/** Nothing reaches over the viewport's width, and the page itself does not scroll. */
async function fitsWidth(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const wide = [...document.querySelectorAll('button, section, header, nav')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 0.5);
    });
    return { scrollsX: root.scrollWidth > innerWidth, scrollsY: root.scrollHeight > innerHeight, wide: wide.length };
  });
}

test("each category opens in Streamline's order and the page fits 1280 x 800 without a horizontal scroll", async ({ page }) => {
  await openSettings(page);
  // Without a stored place the page opens on Quick Adjustments, as Streamline does.
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', 'quickadjustments');
  await expect(page.locator('.tree .category')).toHaveText([
    '1. Quick Adjustments',
    '2. Connections',
    '3. Calibration',
    '4. Machine',
    '5. Maintenance',
    '6. Skin',
    '8. Extensions',
    '9. Miscellaneous',
    '10. Updates',
    '11. User Manual',
  ]);
  const sections: Record<string, string[]> = {
    quickadjustments: ['flowmultiplier', 'steam', 'hotwater', 'watertank', 'flush', 'machineadvancedsettings'],
    bluetooth: ['ble_machine', 'ble_scale'],
    calibration: ['defaultloadsettings', 'refillkit', 'voltage', 'fan', 'sensors'],
    machine: ['usbchargermode', 'machineinfo'],
    maintenance: ['machinecleaning', 'machinedescaling', 'transportmode'],
    extensions: ['extention2'],
    miscellaneous: ['reasettings', 'brightness', 'wakelock', 'presence'],
    updates: ['firmwareupdate', 'appupdate'],
    usermanual: ['quickstart', 'feedback'],
  };
  await expect(shown(page, 'weight-flow-multiplier')).toHaveText('1.0');
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
  await page.screenshot({ path: 'docs/product/settings-quick-adjustments.png' });

  for (const [id, subs] of Object.entries(sections)) {
    await page.getByTestId(`settings-category-${id}`).click();
    await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', id);
    for (const sub of subs) {
      await expect(page.getByTestId(`settings-section-${sub}`)).toHaveCount(1);
      await expect(page.getByTestId(`settings-sub-${sub}`)).toBeVisible();
    }
    expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
  }
  // A subcategory in the left column scrolls the panel to it.
  await page.getByTestId('settings-category-quickadjustments').click();
  await page.getByTestId('settings-sub-machineadvancedsettings').click();
  await expect(page.getByTestId('settings-section-machineadvancedsettings')).toBeInViewport();

  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('settings-steam')).toBeVisible();
  for (const id of ['settings-steam', 'settings-hot-water', 'settings-profile', 'settings-graph', 'settings-backup']) {
    await expect(page.getByTestId(id)).toHaveCount(1);
  }
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
  await page.screenshot({ path: 'docs/product/settings-skin.png' });

  // The place is kept over a reload: the last category, not a setting.
  await page.reload();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', 'skin');
  expect(await page.evaluate(() => localStorage.getItem('pureflow.settings-location'))).toBe('skin');
});

test('a typed number is written with its key alone, and the page shows what the next read returns', async ({ page }) => {
  await openSettings(page);
  await type(page, 'setting-weight-flow-multiplier', '1.2');
  await expect(shown(page, 'weight-flow-multiplier')).toHaveText('1.2');
  expect(writes('POST', '/api/v1/settings')).toEqual([{ weightFlowMultiplier: 1.2 }]);

  // Two places for a multiplier of 0.05 steps.
  await type(page, 'setting-volume-flow-multiplier', '0.35');
  await expect(shown(page, 'volume-flow-multiplier')).toHaveText('0.35s');
  expect(gateway.decaidSettings.volumeFlowMultiplier).toBe(0.35);

  await type(page, 'setting-heater-idle-temperature', '96');
  await expect(shown(page, 'heater-idle-temperature')).toHaveText('96°C');
  expect(writes('POST', '/api/v1/machine/settings/advanced')).toEqual([{ heaterIdleTemp: 96 }]);

  // The simulated DE1 does not keep the tank temperature: the page shows the machine's 20, not 30.
  const reads = gateway.calls('GET', '/api/v1/machine/settings').length;
  await type(page, 'setting-tank-temperature', '30');
  await expect.poll(() => gateway.calls('GET', '/api/v1/machine/settings').length).toBe(reads + 1);
  expect(writes('POST', '/api/v1/machine/settings')).toEqual([{ tankTemp: 30 }]);
  await expect(shown(page, 'tank-temperature')).toHaveText('20°C');

  // The water alert says its ml after the mm: 5 mm is 124 ml, 15 mm 398 ml, each about.
  await expect(shown(page, 'water-alert')).toHaveText('5mm, about 120 ml');
  await type(page, 'setting-water-alert', '15');
  await expect(shown(page, 'water-alert')).toHaveText('15mm, about 400 ml');
  expect(writes('POST', '/api/v1/machine/waterLevels')).toEqual([{ refillLevel: 15 }]);
  // Below them the skin's own tank unit: saved in the skin, nothing to the machine.
  const tank = page.getByTestId('settings-section-watertank');
  await expect(tank.locator('[data-testid^="row-"]')).toHaveText([/tank temperature/, /water level alert/, /tank unit/]);
  await tank.getByTestId('setting-tank-unit-mm').click();
  await expect(tank.getByTestId('setting-tank-unit-mm')).toHaveAttribute('aria-pressed', 'true');
  expect(writes('POST', '/api/v1/machine/settings')).toEqual([{ tankTemp: 30 }]);
  expect(writes('POST', '/api/v1/machine/waterLevels')).toEqual([{ refillLevel: 15 }]);

  // A workflow value: only its key in steamSettings, and the skin's workflow follows.
  await type(page, 'setting-steam-flow', '1.4');
  await expect(shown(page, 'steam-flow')).toHaveText('1.4ml/s');
  expect(writes('PUT', '/api/v1/workflow')).toEqual([{ steamSettings: { flow: 1.4 } }]);

  // A choice and a switch.
  await page.getByTestId('setting-steam-purge-mode-1').click();
  await expect(page.getByTestId('setting-steam-purge-mode-1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('setting-stop-hot-water-at-weight').click();
  await expect(page.getByTestId('setting-stop-hot-water-at-weight')).toHaveAttribute('aria-checked', 'false');
  expect(gateway.decaidSettings.stopHotWaterAtWeight).toBe(false);
  expect(writes('POST', '/api/v1/machine/settings').at(-1)).toEqual({ steamPurgeMode: 1 });

  // The USB charger takes 'enable' and reads back as true.
  await page.getByTestId('settings-category-machine').click();
  await page.getByTestId('setting-usb-charger').click();
  await expect(page.getByTestId('setting-usb-charger')).toHaveAttribute('aria-checked', 'true');
  expect(writes('POST', '/api/v1/machine/settings').at(-1)).toEqual({ usb: 'enable' });
  // The night mode's times, typed as hhmm.
  await expect(shown(page, 'night-mode-sleep')).toHaveText('22:00');
  await type(page, 'setting-night-mode-sleep', '2215');
  await expect(shown(page, 'night-mode-sleep')).toHaveText('22:15');
  expect(gateway.decaidSettings.nightModeSleepTime).toBe(1335);

  // Brightness and wake lock.
  await page.getByTestId('settings-category-miscellaneous').click();
  await expect(page.getByTestId('setting-decaid-version')).toHaveText('0.8.8 (2900)');
  await type(page, 'setting-brightness', '70');
  await expect(shown(page, 'brightness')).toHaveText('70');
  await page.getByTestId('setting-wake-lock').click();
  await expect(page.getByTestId('setting-wake-lock')).toHaveAttribute('aria-checked', 'true');
  expect(gateway.calls('POST', '/api/v1/display/wakelock')).toHaveLength(1);
});

test('the flush: temperature, flow and duration are the workflow rinseData, read back, and reach the machine', async ({ page }) => {
  await openSettings(page);
  await page.getByTestId('settings-sub-flush').click();
  await expect(shown(page, 'flush-flow')).toHaveText('6.0ml/s');
  await expect(shown(page, 'flush-duration')).toHaveText('10s');
  await type(page, 'setting-flush-duration', '14');
  await expect(shown(page, 'flush-duration')).toHaveText('14s');
  await type(page, 'setting-flush-flow', '4.5');
  await expect(shown(page, 'flush-flow')).toHaveText('4.5ml/s');
  expect(writes('PUT', '/api/v1/workflow')).toEqual([
    { rinseData: { targetTemperature: 90, duration: 14, flow: 6 } },
    { rinseData: { targetTemperature: 90, duration: 14, flow: 4.5 } },
  ]);
  expect(gateway.workflow.rinseData).toEqual({ targetTemperature: 90, duration: 14, flow: 4.5 });
  await page.screenshot({ path: 'docs/product/settings-flush.png' });
  expect(gateway.machineSettings).toMatchObject({ flushFlow: 4.5, flushTimeout: 14, flushTemp: 90 });
  // The ring of a flush on home counts the new duration.
  await back(page);
  gateway.waterFor('flush', 3, 4.5);
  await expect(page.getByTestId('water-time')).toContainText('/ 14 s');
});

test('a confirm comes before the voltage, the factory reset and the gateway mode', async ({ page }) => {
  await openSettings(page);
  await page.getByTestId('settings-category-calibration').click();

  await page.getByTestId('setting-heater-voltage-230').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('restart');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('POST', '/api/v1/machine/settings/advanced')).toHaveLength(0);
  await expect(page.getByTestId('setting-heater-voltage-120')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('setting-heater-voltage-230').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('setting-heater-voltage-230')).toHaveAttribute('aria-pressed', 'true');
  expect(writes('POST', '/api/v1/machine/settings/advanced')).toEqual([{ heaterVoltage: 230 }]);

  await type(page, 'setting-fan-threshold', '40');
  await expect(shown(page, 'fan-threshold')).toHaveText('40°C');
  await page.getByTestId('settings-action-reset').click();
  await expect(page.getByTestId('settings-confirm')).toBeVisible();
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('DELETE', '/api/v1/machine/settings/reset')).toHaveLength(0);
  await page.getByTestId('settings-action-reset').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(shown(page, 'fan-threshold')).toHaveText('55°C');
  expect(gateway.calls('DELETE', '/api/v1/machine/settings/reset')).toHaveLength(1);

  await page.getByTestId('settings-category-miscellaneous').click();
  await page.getByTestId('setting-gateway-mode-disabled').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('stop at weight');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('POST', '/api/v1/settings')).toHaveLength(0);
  await expect(page.getByTestId('setting-gateway-mode-tracking')).toHaveAttribute('aria-pressed', 'true');

  // Fast Start Defaults need no confirm: one write of the four.
  await page.getByTestId('settings-category-quickadjustments').click();
  await page.getByTestId('settings-action-fast-start').click();
  await expect(shown(page, 'heater-idle-temperature')).toHaveText('99°C');
  expect(writes('POST', '/api/v1/machine/settings/advanced').at(-1)).toEqual({
    heaterIdleTemp: 99,
    heaterPh1Flow: 2,
    heaterPh2Flow: 4,
    heaterPh2Timeout: 1,
  });
});

test('without a machine the machine values are not read and say so; a failed write keeps the value', async ({ page }) => {
  gateway.machineConnected = false;
  await openSettings(page);
  await expect(page.getByTestId('settings-section-watertank').getByTestId('settings-unread')).toContainText('Not read');
  await expect(page.getByTestId('setting-tank-temperature')).toBeDisabled();
  // The skin's own tank unit needs no machine.
  await expect(page.getByTestId('setting-tank-unit-mm')).toBeEnabled();
  // Decaid's own settings are read all the same.
  await expect(shown(page, 'weight-flow-multiplier')).toHaveText('1.0');

  await page.route('**/api/v1/settings', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{"error":"refused"}' }) : route.fallback(),
  );
  await type(page, 'setting-weight-flow-multiplier', '1.5');
  await expect(page.getByTestId('setting-error-weight-flow-multiplier')).toContainText('was not set');
  await expect(shown(page, 'weight-flow-multiplier')).toHaveText('1.0');
});

test("the skin's own settings are in Skin, saved and backed up as before", async ({ page }) => {
  await openSettings(page);
  await page.getByTestId('settings-category-skin').click();
  await page.getByTestId('settings-sub-skin-backup').click();
  await expect(page.getByTestId('backup-restore')).toBeInViewport();
  await page.getByTestId('settings-sub-skin-steam').click();
  await type(page, 'setting-mug-small', '160');
  await expect(page.getByTestId('setting-mug-small').locator('b')).toHaveText('160g');
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('pureflow.settings')!) as Settings).steam.mugSmall)).toBe(160);
  await expect
    .poll(() => (gateway.store['pureflow/settings-backup'] as Backup | undefined)?.settings?.steam?.mugSmall, { timeout: 10_000 })
    .toBe(160);
  // Nothing of Decaid's was written for it.
  expect(gateway.writes().filter((request) => !request.path.startsWith('/api/v1/store'))).toEqual([]);
});
