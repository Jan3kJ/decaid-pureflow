import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// The settings page's plugins, presence, firmware and sensor calibration,
// against the mocked gateway: a plugin setting of each type written and
// read back, a secure one never shown, enable / disable, a held update approved; the sleep
// timeout, a wake schedule added, edited and deleted; the firmware's status and its confirm; a
// sensor corrected and restored. The same against the running gateway:
// e2e-rig/settings-extensions.spec.ts.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    // A request without a machine is a 500 the browser logs by itself.
    if (message.type() === 'error' && !/500 \(/.test(message.text())) errors.push(message.text());
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

async function type(page: Page, testid: string, value: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

const writes = (method: string, path: string | RegExp) => gateway.calls(method, path).map((call) => call.body);

/** Nothing reaches over the viewport's width, and the page itself does not scroll. */
async function fitsWidth(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const wide = [...document.querySelectorAll('button, section, header, nav, input, article')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 0.5);
    });
    return { scrollsX: root.scrollWidth > innerWidth, scrollsY: root.scrollHeight > innerHeight, wide: wide.length };
  });
}

const VISUALIZER = 'visualizer.reaplugin';
const SETTINGS = `/api/v1/plugins/${VISUALIZER}/settings`;

test('a plugin setting of each type is written alone and the card shows what the gateway reads back', async ({ page }) => {
  await openCategory(page, 'extensions');
  await expect(page.getByTestId(`plugin-${VISUALIZER}`)).toBeVisible();
  // Sorted by name: DYE2, Time to Ready, Visualizer.
  expect(
    await page
      .locator('[data-testid^="plugin-"][data-loaded]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid'))),
  ).toEqual(['plugin-dye2.reaplugin', 'plugin-time-to-ready.reaplugin', `plugin-${VISUALIZER}`]);
  await expect(page.getByTestId(`plugin-setting-${VISUALIZER}-Username`)).toHaveValue('janek');
  // Not stored: the manifest's default.
  await expect(page.getByTestId(`plugin-setting-${VISUALIZER}-LengthThreshold`)).toHaveText('5');
  await expect(page.getByTestId(`plugin-setting-${VISUALIZER}-AutoUpload`)).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'docs/product/settings-plugins.png' });

  // a number, on the pad
  await type(page, `plugin-setting-${VISUALIZER}-LengthThreshold`, '12');
  await expect(page.getByTestId(`plugin-setting-${VISUALIZER}-LengthThreshold`)).toHaveText('12');
  // a boolean
  await page.getByTestId(`plugin-setting-${VISUALIZER}-AutoUpload`).click();
  await expect(page.getByTestId(`plugin-setting-${VISUALIZER}-AutoUpload`)).toHaveAttribute('aria-checked', 'false');
  // a string
  await page.getByTestId(`plugin-setting-${VISUALIZER}-Username`).fill('  barista ');
  await page.getByTestId(`plugin-setting-${VISUALIZER}-Username`).press('Enter');
  await expect(page.getByTestId(`plugin-setting-${VISUALIZER}-Username`)).toHaveValue('barista');
  // an enum
  await page.getByTestId('plugin-setting-dye2.reaplugin-Theme-light').click();
  await expect(page.getByTestId('plugin-setting-dye2.reaplugin-Theme-light')).toHaveAttribute('aria-pressed', 'true');

  expect(writes('POST', SETTINGS)).toEqual([{ LengthThreshold: 12 }, { AutoUpload: false }, { Username: 'barista' }]);
  expect(writes('POST', '/api/v1/plugins/dye2.reaplugin/settings')).toEqual([{ Theme: 'light' }]);
  // Each write is read back.
  expect(gateway.calls('GET', SETTINGS).length).toBeGreaterThanOrEqual(4);
  expect(gateway.pluginSettings[VISUALIZER]).toEqual({ Username: 'barista', LengthThreshold: 12, AutoUpload: false });
});

test('a secure value is written as typed and never shown: only whether one is stored', async ({ page }) => {
  await openCategory(page, 'extensions');
  const password = page.getByTestId(`plugin-setting-${VISUALIZER}-Password`);
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('');
  await expect(password).toHaveAttribute('placeholder', 'Not set');

  await password.fill(' s3cret ');
  await password.press('Enter');
  await expect(password).toHaveAttribute('placeholder', 'Saved');
  await expect(password).toHaveValue('');
  expect(writes('POST', SETTINGS)).toEqual([{ Password: ' s3cret ' }]);

  // An empty field writes nothing; the page holds the text nowhere.
  await password.fill('');
  await password.press('Enter');
  expect(writes('POST', SETTINGS)).toHaveLength(1);
  expect(await page.content()).not.toContain('s3cret');
});

test('a plugin is disabled and enabled again, and a held update is approved after a confirm', async ({ page }) => {
  await openCategory(page, 'extensions');
  const enabled = page.getByTestId('plugin-enabled-time-to-ready.reaplugin');
  await expect(enabled).toHaveAttribute('aria-checked', 'true');
  await enabled.click();
  await expect(enabled).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('plugin-status-time-to-ready.reaplugin')).toHaveText('Not loaded');
  await enabled.click();
  await expect(enabled).toHaveAttribute('aria-checked', 'true');
  expect(
    gateway.requests
      .filter((call) => /plugins\/time-to-ready\.reaplugin\/(en|dis)able$/.test(call.path))
      .map((call) => call.path.split('/').pop()),
  ).toEqual(['disable', 'enable']);

  await expect(page.getByTestId('plugin-status-dye2.reaplugin')).toHaveText('Update needs approval');
  await page.getByTestId('plugin-approve-dye2.reaplugin').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('network.tcp');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('POST', '/api/v1/plugins/dye2.reaplugin/update/approve')).toHaveLength(0);
  await page.getByTestId('plugin-approve-dye2.reaplugin').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('plugin-approve-dye2.reaplugin')).toHaveCount(0);
  expect(gateway.calls('POST', '/api/v1/plugins/dye2.reaplugin/update/approve')).toHaveLength(1);

  await page.getByTestId('plugins-check').click();
  await expect(page.getByTestId('plugins-checked')).toBeVisible();
  expect(gateway.calls('POST', '/api/v1/plugins/update')).toHaveLength(1);
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
});

test('presence: the sleep timeout is written and read back; a wake schedule is added, edited and deleted', async ({ page }) => {
  await openCategory(page, 'miscellaneous');
  await page.getByTestId('settings-sub-presence').click();
  await expect(page.getByTestId('setting-sleep-timeout')).toContainText('30');
  await type(page, 'setting-sleep-timeout', '45');
  await expect(page.getByTestId('setting-sleep-timeout')).toContainText('45');
  await page.getByTestId('setting-presence-enabled').click();
  await expect(page.getByTestId('setting-presence-enabled')).toHaveAttribute('aria-checked', 'false');
  expect(writes('POST', '/api/v1/presence/settings')).toEqual([{ sleepTimeoutMinutes: 45 }, { userPresenceEnabled: false }]);

  // added
  await page.getByTestId('schedule-add').click();
  await type(page, 'schedule-time', '0615');
  await page.getByTestId('schedule-day-1').click();
  await page.getByTestId('schedule-day-3').click();
  await type(page, 'schedule-keep-awake', '90');
  await page.getByTestId('schedule-save').click();
  await expect(page.getByTestId('schedule-form')).toHaveCount(0);
  await expect(page.getByTestId('schedule-text-schedule-1')).toHaveText('06:15, Mon, Wed, awake for 1 h 30 min');
  expect(writes('POST', '/api/v1/presence/schedules')).toEqual([
    { time: '06:15', daysOfWeek: [1, 3], enabled: true, keepAwakeFor: 90 },
  ]);
  await page.getByTestId('settings-sub-presence').click();
  await page.screenshot({ path: 'docs/product/settings-presence.png' });

  // edited: the time, a day less, no keep-awake; then switched off
  await page.getByTestId('schedule-edit-schedule-1').click();
  await expect(page.getByTestId('schedule-time')).toHaveText('06:15');
  await type(page, 'schedule-time', '0700');
  await page.getByTestId('schedule-day-3').click();
  await type(page, 'schedule-keep-awake', '0');
  await page.getByTestId('schedule-save').click();
  await expect(page.getByTestId('schedule-text-schedule-1')).toHaveText('07:00, Mon');
  await page.getByTestId('schedule-enabled-schedule-1').click();
  await expect(page.getByTestId('schedule-enabled-schedule-1')).toHaveAttribute('aria-checked', 'false');
  expect(writes('PUT', '/api/v1/presence/schedules/schedule-1')).toEqual([
    { time: '07:00', daysOfWeek: [1], enabled: true, keepAwakeFor: null },
    { enabled: false },
  ]);

  // deleted, after a confirm
  await page.getByTestId('schedule-delete-schedule-1').click();
  await page.getByTestId('settings-confirm-cancel').click();
  await expect(page.getByTestId('schedule-schedule-1')).toBeVisible();
  await page.getByTestId('schedule-delete-schedule-1').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('schedule-schedule-1')).toHaveCount(0);
  expect(gateway.calls('DELETE', '/api/v1/presence/schedules/schedule-1')).toHaveLength(1);
  expect(gateway.presence.schedules).toEqual([]);
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
});

test('the firmware: the status and the bundled builds, and Install only after its confirm', async ({ page }) => {
  await openCategory(page, 'updates');
  await expect(page.getByTestId('firmware-status')).toHaveAttribute('data-status', 'update-available');
  await expect(page.getByTestId('firmware-installed')).toHaveText('1337');
  await expect(page.getByTestId('firmware-artifact-de1-1352')).toContainText('Applies');
  await expect(page.getByTestId('firmware-artifact-de1-1358')).toContainText('recommended');
  await expect(page.getByTestId('app-update-state')).toHaveText('No update known.');

  await page.getByTestId('firmware-install').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('50 minutes');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('POST', '/api/v1/machine/firmware/apply')).toHaveLength(0);

  await page.getByTestId('firmware-install').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('firmware-done')).toContainText('Restart');
  expect(writes('POST', '/api/v1/machine/firmware/apply')).toEqual([{ artifactId: 'de1-1358' }]);
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
});

test('a failed firmware stream says why', async ({ page }) => {
  gateway.firmwareStream = ['{"status":"erasing","progress":0.0}', '{"status":"error","progress":-1.0,"error":"CRC mismatch"}'];
  await openCategory(page, 'updates');
  await page.getByTestId('firmware-install').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('firmware-failed')).toContainText('CRC mismatch');
});

test('a sensor is corrected from a capture and a measured value after a confirm, and restored', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('pureflow.sensor-calibration-previous'));
  await openCategory(page, 'calibration');
  await page.getByTestId('settings-sub-sensors').click();
  await expect(page.getByTestId('sensor-stored-temperature')).toHaveText('+0.00 °C');
  await expect(page.getByTestId('sensor-reading-temperature')).toHaveText('92.6 °C');
  await expect(page.getByTestId('sensor-apply-temperature')).toBeDisabled();
  await expect(page.getByTestId('sensor-restore-temperature')).toBeDisabled();

  await page.getByTestId('sensor-capture-temperature').click();
  await type(page, 'sensor-measured-temperature', '93.6');
  await expect(page.getByTestId('sensor-status-temperature')).toHaveText('+0.00 °C → +1.00 °C');
  await page.getByTestId('sensor-apply-temperature').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('unusable');
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('sensor-stored-temperature')).toHaveText('+1.00 °C');
  await expect(page.getByTestId('sensor-previous-temperature')).toHaveText('+0.00 °C');
  expect(writes('PUT', '/api/v1/machine/calibration/temperature')).toEqual([{ de1ReportedValue: 92.6, measuredValue: 93.6 }]);

  // An idle machine reads 0 bar: a pressure capture is refused, nothing is written.
  await page.getByTestId('sensor-capture-pressure').click();
  await type(page, 'sensor-measured-pressure', '1');
  await expect(page.getByTestId('sensor-status-pressure')).toContainText('not running');
  await expect(page.getByTestId('sensor-apply-pressure')).toBeDisabled();

  await page.getByTestId('sensor-restore-temperature').click();
  await expect(page.getByTestId('sensor-stored-temperature')).toHaveText('+0.00 °C');
  expect(writes('PUT', '/api/v1/machine/calibration/temperature')[1]).toEqual({ de1ReportedValue: 1, measuredValue: 0 });
  await expect(page.getByTestId('sensor-restore-temperature')).toBeDisabled();
  expect(gateway.calibration.temperature).toBeCloseTo(0);
  expect(await fitsWidth(page)).toEqual({ scrollsX: false, scrollsY: false, wide: 0 });
});

test('without a machine the sensors say so and offer to read again', async ({ page }) => {
  gateway.machineConnected = false;
  await openCategory(page, 'calibration');
  await expect(page.getByTestId('sensor-error')).toContainText('500');
});
