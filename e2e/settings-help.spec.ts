import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// The rest of Streamline's settings (spec 3.9 item 15, U12): the Bengle pages (only on a Bengle),
// the manual, Send Feedback and the firmware upload from a file, against the mocked gateway.
// Feedback and firmware are never sent anywhere else: the mock answers them. The same pages
// against the running gateway, read only: e2e-rig/settings-help.spec.ts.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    // A refused request is logged by the browser by itself.
    if (message.type() === 'error' && !/status of (400|404|500|503)/.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const BENGLE = { version: '1337', model: 'Bengle', serialNumber: 'mock-bengle', GHC: false, extra: { refillKit: true, voltage: 230 } };

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

test('the Bengle pages are not on the page of another machine, and no request asks for them', async ({ page }) => {
  await openCategory(page, 'machine');
  await expect(page.getByTestId('settings-section-machineinfo')).toBeVisible();
  await expect(page.getByTestId('settings-section-cupwarmer')).toHaveCount(0);
  await expect(page.getByTestId('settings-section-ledstrip')).toHaveCount(0);
  await page.getByTestId('settings-category-calibration').click();
  await expect(page.getByTestId('settings-section-sensors')).toBeVisible();
  await expect(page.getByTestId('settings-section-loadcell')).toHaveCount(0);
  expect(gateway.requests.filter((request) => /cupWarmer|ledStrip|scaleCalibration/.test(request.path))).toEqual([]);
});

test('the cup warmer: the switch, the target on the pad and the pre-warm', async ({ page }) => {
  gateway.machineInfo = BENGLE;
  await openCategory(page, 'machine');
  await expect(page.getByTestId('cup-warmer-current')).toHaveText('38.4 °C');
  await expect(page.getByTestId('cup-warmer-switch')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('cup-warmer-target')).toHaveText('60°C');

  await page.getByTestId('cup-warmer-switch').click();
  await expect(page.getByTestId('cup-warmer-switch')).toHaveAttribute('aria-checked', 'true');
  await type(page, 'cup-warmer-target', '55');
  await expect(page.getByTestId('cup-warmer-target')).toHaveText('55°C');
  await page.getByTestId('cup-warmer-switch').click();
  await expect(page.getByTestId('cup-warmer-switch')).toHaveAttribute('aria-checked', 'false');
  // Off keeps the setpoint, which the page shows again.
  await expect(page.getByTestId('cup-warmer-target')).toHaveText('55°C');
  expect(writes('PUT', '/api/v1/machine/cupWarmer')).toEqual([{ temperature: 60 }, { temperature: 55 }, { enabled: false }]);

  await page.getByTestId('cup-warmer-preheat').click();
  await expect(page.getByTestId('cup-warmer-preheat')).toHaveAttribute('aria-checked', 'true');
  await type(page, 'cup-warmer-lead', '45');
  await expect(page.getByTestId('cup-warmer-lead')).toHaveText('45min');
  expect(writes('PUT', '/api/v1/machine/cupWarmer/preheat')).toEqual([{ enabled: true }, { leadMinutes: 45 }]);
  await page.screenshot({ path: 'docs/product/settings-cup-warmer.png' });
});

test('a mat without a reading says so', async ({ page }) => {
  gateway.machineInfo = BENGLE;
  gateway.cupWarmer.currentTemperature = null;
  await openCategory(page, 'machine');
  await expect(page.getByTestId('cup-warmer-current')).toHaveText('No reading');
});

test('the lighting: a colour changed is written whole with Save, Discard brings the machine back', async ({ page }) => {
  gateway.machineInfo = BENGLE;
  await openCategory(page, 'machine');
  const front = page.getByTestId('led-frontStrip-awake');
  await expect(front).toHaveValue('#ff0000');
  await expect(page.getByTestId('led-save')).toBeDisabled();

  await front.fill('#00ff80');
  await expect(page.getByTestId('led-save')).toBeEnabled();
  await page.getByTestId('led-reload').click();
  await expect(front).toHaveValue('#ff0000');
  expect(gateway.calls('PUT', '/api/v1/machine/ledStrip')).toHaveLength(0);

  await front.fill('#00ff80');
  await page.getByTestId('led-save').click();
  await expect(page.getByTestId('led-save')).toBeDisabled();
  expect(writes('PUT', '/api/v1/machine/ledStrip')).toEqual([
    {
      frontStrip: { awake: '0000ffff8080', sleeping: '000000000000' },
      backStrip: { awake: '0000ffff0000', sleeping: '000000000000' },
    },
  ]);
  await expect(front).toHaveValue('#00ff80');
});

test('the load cells: zero, a known mass on the pad, no second command while one runs, abort', async ({ page }) => {
  gateway.machineInfo = BENGLE;
  await openCategory(page, 'calibration');
  await expect(page.getByTestId('calibration-step')).toHaveText('Ready');
  await expect(page.getByTestId('calibration-abort')).toBeDisabled();

  await page.getByTestId('calibration-zero').click();
  await expect(page.getByTestId('calibration-step')).toHaveText('Finding the zero (8 s)');
  await expect(page.getByTestId('calibration-zero')).toBeDisabled();
  await expect(page.getByTestId('calibration-latch')).toBeDisabled();
  await page.getByTestId('calibration-abort').click();
  await expect(page.getByTestId('calibration-step')).toHaveText('Ready');

  await type(page, 'calibration-grams', '250.5');
  await expect(page.getByTestId('calibration-grams')).toHaveText('250.5g');
  await page.getByTestId('calibration-latch').click();
  await expect(page.getByTestId('calibration-step')).toHaveText('Measuring the known mass (8 s)');
  expect(writes('PUT', '/api/v1/machine/scaleCalibration')).toEqual([
    { command: 'zero' },
    { command: 'abort' },
    { command: 'latch', weightGrams: 250.5 },
  ]);
});

test('a refused Bengle request is said on the page', async ({ page }) => {
  gateway.machineInfo = BENGLE;
  await openCategory(page, 'machine');
  gateway.machineInfo = { ...BENGLE, model: 'DE1Pro' };
  await page.getByTestId('cup-warmer-switch').click();
  await expect(page.getByTestId('bengle-failed')).toBeVisible();
});

test('the manual links to the guides', async ({ page }) => {
  await openCategory(page, 'usermanual');
  await expect(page.getByTestId('manual-quickstart')).toHaveAttribute('href', 'https://decentespresso.com/doc/quickstart/');
  await expect(page.getByTestId('manual-skin')).toHaveAttribute('href', /decaid-pureflow/);
  await expect(page.getByTestId('manual-quickstart')).toHaveAttribute('target', '_blank');
});

test('feedback: nothing is sent without a title or before the confirm; then it goes out whole', async ({ page }) => {
  await openCategory(page, 'usermanual');
  await page.getByTestId('settings-sub-feedback').click();
  await expect(page.getByTestId('feedback-send')).toBeDisabled();
  await page.getByTestId('feedback-type-feature').click();
  await page.getByTestId('feedback-title').fill('Steam page');
  await page.getByTestId('feedback-description').fill('Show the milk weight.');
  await page.getByTestId('feedback-attach').click();
  await page.getByTestId('feedback-send').click();
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('POST', '/api/v1/feedback')).toHaveLength(0);

  await page.getByTestId('feedback-send').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('feedback-sent')).toContainText('Submitted!');
  await expect(page.getByTestId('feedback-sent').getByRole('link')).toHaveAttribute('href', /issues\/1$/);
  expect(writes('POST', '/api/v1/feedback')).toEqual([
    { description: '**Steam page**\n\nShow the milk weight.', type: 'feature', includeLogs: false, includeSystemInfo: false },
  ]);
  // sent: the form is empty again
  await expect(page.getByTestId('feedback-title')).toHaveValue('');
});

test('a refused feedback says why and keeps what was written', async ({ page }) => {
  gateway.feedbackStatus = 400;
  await openCategory(page, 'usermanual');
  await page.getByTestId('settings-sub-feedback').click();
  await page.getByTestId('feedback-title').fill('Steam page');
  await page.getByTestId('feedback-send').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('feedback-failed')).toContainText('400');
  await expect(page.getByTestId('feedback-title')).toHaveValue('Steam page');
});

const IMAGE = Buffer.from(Array.from({ length: 2048 }, (_, index) => index % 251));

test('the firmware file: the confirm says the machine must stay on, then the progress and the end', async ({ page }) => {
  await openCategory(page, 'updates');
  await page
    .getByTestId('firmware-file-input')
    .setInputFiles({ name: 'de1.dat', mimeType: 'application/octet-stream', buffer: IMAGE });
  await expect(page.getByTestId('settings-confirm')).toContainText('de1.dat');
  await expect(page.getByTestId('settings-confirm')).toContainText('Keep the machine switched on');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('POST', '/api/v1/machine/firmware')).toHaveLength(0);

  await page
    .getByTestId('firmware-file-input')
    .setInputFiles({ name: 'de1.dat', mimeType: 'application/octet-stream', buffer: IMAGE });
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('firmware-done')).toContainText('Restart');
  expect(gateway.calls('POST', '/api/v1/machine/firmware')).toHaveLength(1);
  expect(gateway.firmwareUpload).toBe(IMAGE.length);
  // the bundled build was not applied
  expect(gateway.calls('POST', '/api/v1/machine/firmware/apply')).toHaveLength(0);
});

test('a firmware file the machine refuses says why', async ({ page }) => {
  gateway.firmwareStream = ['{"status":"erasing","progress":0.0}', '{"status":"error","progress":-1.0,"error":"bad image"}'];
  await openCategory(page, 'updates');
  await page.getByTestId('firmware-file-input').setInputFiles({ name: 'x.dat', mimeType: 'application/octet-stream', buffer: IMAGE });
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('firmware-failed')).toContainText('bad image');
});
