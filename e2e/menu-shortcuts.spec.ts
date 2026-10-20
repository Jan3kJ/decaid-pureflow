import { expect, test, type Page } from '@playwright/test';
import type { Settings } from '../src/settings';
import type { Backup } from '../src/settings-backup';
import { mockGateway } from './mock-gateway';

// Acceptance item 18 (spec 3.7, R4) against a mocked gateway: the home menu's steam switch
// writes the workflow's steam temperature (0 is off) and shows the heater's state; machine sleep
// is sleep, as Decaid cannot switch the DE1 off (research.md 22); machine and app sleep also
// releases Decaid's wake lock and dims the screen to 0 until the wake (spec 3.9 item 2). The same against the
// running gateway: e2e-rig/menu-shortcuts.spec.ts.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

async function openMenu(page: Page) {
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('menu-list')).toBeVisible();
}

const steamWrites = (gateway: Awaited<ReturnType<typeof mockGateway>>) =>
  gateway
    .calls('PUT', '/api/v1/workflow')
    .filter((call) => call.body?.steamSettings?.targetTemperature !== undefined)
    .map((call) => call.body.steamSettings);

test('steam off switches the heater off, shows it, and a second tap switches it on again (item 18)', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  await openMenu(page);
  await expect(page.getByTestId('steam-heater')).toBeEnabled();
  await expect(page.getByTestId('steam-heater')).toContainText('Steam off');
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  await page.getByTestId('steam-heater').click();
  await expect(page.getByTestId('menu-list')).toHaveCount(0);
  // Only the temperature is written: the steam timer and flow keep their values.
  await expect.poll(() => steamWrites(gateway)).toEqual([{ targetTemperature: 0 }]);
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(0);
  expect(gateway.workflow.steamSettings).toMatchObject({ duration: 50, flow: 0.8 });

  // The menu says the heater is off, from the machine's own settings.
  await openMenu(page);
  await expect(page.getByTestId('steam-heater')).toContainText('Steam on');
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is off');
  await page.screenshot({ path: 'docs/product/home-menu-steam-off.png' });
  await page.getByTestId('steam-heater').click();
  await expect.poll(() => steamWrites(gateway)).toEqual([{ targetTemperature: 0 }, { targetTemperature: 150 }]);
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(150);
  await openMenu(page);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  expect(errors).toEqual([]);
});

test('steam on brings back the temperature the heater had, and it is in the settings and their backup', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.steamSettings = { ...gateway.workflow.steamSettings, targetTemperature: 158 };
  gateway.shotSettings = { ...gateway.shotSettings, targetSteamTemp: 158 };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  await openMenu(page);
  await page.getByTestId('steam-heater').click();
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pureflow.settings') ?? '{}') as Settings);
  expect(stored.steam.heaterTemperature).toBe(158);
  await expect
    .poll(() => (gateway.store['pureflow/settings-backup'] as Backup | undefined)?.settings?.steam?.heaterTemperature, {
      timeout: 10_000,
    })
    .toBe(158);

  // After a reload the remembered temperature is still the one switched on with.
  await page.reload();
  await openMenu(page);
  await expect(page.getByTestId('steam-heater')).toContainText('Steam on');
  await page.getByTestId('steam-heater').click();
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(158);
  expect(errors).toEqual([]);
});

test('steam on reaches the machine when the workflow already holds the temperature', async ({ page }) => {
  const gateway = await mockGateway(page);
  // Another client switched the machine's heater off past the workflow.
  gateway.shotSettings = { ...gateway.shotSettings, targetSteamTemp: 0 };
  await page.goto('/');
  await openMenu(page);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is off');
  await page.getByTestId('steam-heater').click();
  await expect
    .poll(() => gateway.calls('POST', '/api/v1/machine/shotSettings').map((call) => call.body.targetSteamTemp))
    .toEqual([150]);
  await openMenu(page);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  expect(errors).toEqual([]);
});

test('machine sleep: the entry says only the machine sleeps and sends the state sleeping (spec 3.9 item 1)', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await openMenu(page);
  await expect(page.getByTestId('machine-sleep')).toContainText('Machine sleep');
  await expect(page.getByTestId('machine-sleep-detail')).toHaveText(
    'only the machine sleeps, not the app: Decaid cannot switch the DE1 off',
  );
  await expect(page.getByRole('menuitem').filter({ hasText: /Machine off|Exit/ })).toHaveCount(0);
  await page.getByTestId('machine-sleep').click();
  await expect
    .poll(() => gateway.calls('PUT', /^\/api\/v1\/machine\/state\//).map((call) => call.path))
    .toEqual(['/api/v1/machine/state/sleeping']);
  await expect(page.getByTestId('asleep')).toBeVisible();
  expect(errors).toEqual([]);
});

test('machine and app sleep: sleeping, the wake lock released and the screen at 0; a touch puts both back (spec 3.9 item 2)', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  gateway.display = { ...gateway.display, wakeLockOverride: true };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await openMenu(page);
  await expect(page.getByTestId('app-sleep')).toContainText('Machine and app sleep');
  await expect(page.getByTestId('app-sleep-detail')).toHaveText(
    "the screen goes dark and then off by the tablet's own timeout; a touch wakes both",
  );
  const start = gateway.requests.length;
  /** what the sleep and the wake asked of Decaid, in order */
  const asked = () =>
    gateway.requests
      .slice(start)
      .filter((call) => /^\/api\/v1\/(machine\/state\/|display\/|settings$)/.test(call.path) && call.method !== 'GET')
      .map((call) => `${call.method} ${call.path}${call.body === undefined ? '' : ` ${JSON.stringify(call.body)}`}`);

  await page.getByTestId('app-sleep').click();
  await expect(page.getByTestId('asleep')).toBeVisible();
  await expect
    .poll(asked)
    .toEqual([
      'PUT /api/v1/machine/state/sleeping',
      'DELETE /api/v1/display/wakelock',
      'POST /api/v1/settings {"keepAwake":false}',
      'PUT /api/v1/display/brightness {"brightness":0}',
    ]);
  expect(gateway.display.wakeLockOverride).toBe(false);
  expect(gateway.decaidSettings.keepAwake).toBe(false);

  await page.touchscreen.tap(1200, 760);
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  await expect
    .poll(asked)
    .toEqual([
      'PUT /api/v1/machine/state/sleeping',
      'DELETE /api/v1/display/wakelock',
      'POST /api/v1/settings {"keepAwake":false}',
      'PUT /api/v1/display/brightness {"brightness":0}',
      'PUT /api/v1/machine/state/idle',
      'POST /api/v1/settings {"keepAwake":true}',
      'POST /api/v1/display/wakelock',
      'PUT /api/v1/display/brightness {"brightness":100}',
    ]);
  expect(gateway.display.wakeLockOverride).toBe(true);
  expect(gateway.decaidSettings.keepAwake).toBe(true);
  expect(gateway.display.requestedBrightness).toBe(100);

  // The next machine sleep is the machine's alone: dimmed, the wake lock left as it is.
  await openMenu(page);
  await page.getByTestId('machine-sleep').click();
  await expect(page.getByTestId('asleep')).toBeVisible();
  await expect
    .poll(() => asked().slice(8))
    .toEqual(['PUT /api/v1/machine/state/sleeping', 'PUT /api/v1/display/brightness {"brightness":5}']);
  expect(errors).toEqual([]);
});

test('without a machine the steam switch is offered from the workflow, machine sleep is not', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.machineConnected = false;
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('No machine connected', { timeout: 10_000 });
  await openMenu(page);
  await expect(page.getByTestId('machine-sleep')).toBeDisabled();
  await expect(page.getByTestId('app-sleep')).toBeDisabled();
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  expect(errors).toEqual([]);
});
