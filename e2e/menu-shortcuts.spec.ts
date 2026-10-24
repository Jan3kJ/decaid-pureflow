import { expect, test, type Page } from '@playwright/test';
import type { Settings } from '../src/settings';
import type { Backup } from '../src/settings-backup';
import { mockGateway, type MockGateway } from './mock-gateway';

// Acceptance item 18 (spec 3.7, R4) against a mocked gateway: the home menu's steam switch
// writes the workflow's steam temperature (0 is off) and shows the heater's state. The two sleeps
// (spec 3.10, acceptance 56): machine sleep sends the machine to sleep and keeps the app awake,
// with 'Wake machine' in the menu; machine and app sleep shows the Asleep screen, dimmed to 5,
// until a touch; neither touches Decaid's wake lock or keepAwake. Acceptance 102: only the steam
// switch has a second line. The same against the running gateway: e2e-rig/menu-shortcuts.spec.ts.

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

/** what a sleep and a wake asked of Decaid, in order, from the request `start` on */
function askedOf(gateway: MockGateway, start: number): () => string[] {
  return () =>
    gateway.requests
      .slice(start)
      .filter((call) => /^\/api\/v1\/(machine\/state\/|display\/|settings$)/.test(call.path) && call.method !== 'GET')
      .map((call) => `${call.method} ${call.path}${call.body === undefined ? '' : ` ${JSON.stringify(call.body)}`}`);
}

test('the two sleep entries have their labels alone, no line under either (spec 3.10, acceptance 56)', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await openMenu(page);
  await expect(page.getByTestId('machine-sleep')).toHaveText('Machine sleep');
  await expect(page.getByTestId('app-sleep')).toHaveText('Machine and app sleep');
  await expect(page.getByTestId('machine-sleep-detail')).toHaveCount(0);
  await expect(page.getByTestId('app-sleep-detail')).toHaveCount(0);
  await expect(page.getByTestId('wake-machine')).toHaveCount(0);
  await expect(page.getByRole('menuitem').filter({ hasText: /Machine off|Exit|Decaid cannot|timeout/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('beans and grinders and clean have no second line; the steam switch has its line in all three states (acceptance 102)', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await openMenu(page);
  await expect(page.getByTestId('open-beans')).toHaveText('Beans and grinders');
  await expect(page.getByTestId('open-clean')).toHaveText('Clean');
  await expect(page.getByTestId('open-beans-detail')).toHaveCount(0);
  await expect(page.getByTestId('open-clean-detail')).toHaveCount(0);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  await page.getByTestId('steam-heater').click();
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(0);
  await openMenu(page);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is off');
  await expect(page.getByTestId('steam-heater-detail')).toHaveClass(/off/);
  expect(errors).toEqual([]);
});

test("the steam switch says 'not known' while neither the machine's settings nor the workflow are read (acceptance 102)", async ({
  page,
}) => {
  await mockGateway(page);
  // Routes added later are matched first: no workflow, and a settings stream that sends nothing.
  await page.route(/:8080\/api\/v1\/workflow/, (route) => route.fulfill({ status: 503, body: '' }));
  await page.routeWebSocket(/:8080\/ws\/v1\/machine\/shotSettings/, () => {});
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await openMenu(page);
  await expect(page.getByTestId('steam-heater')).toBeDisabled();
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater: not known');
  await expect(page.getByTestId('open-beans-detail')).toHaveCount(0);
  await expect(page.getByTestId('open-clean-detail')).toHaveCount(0);
});

test("machine sleep: sleeping, the app stays awake and undimmed, 'Wake machine' asks for idle (spec 3.10, acceptance 56)", async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  const asked = askedOf(gateway, gateway.requests.length);
  await openMenu(page);
  await page.getByTestId('machine-sleep').click();
  await expect.poll(asked).toEqual(['PUT /api/v1/machine/state/sleeping']);
  await expect(page.getByTestId('status-title')).toHaveText('Asleep');
  // The skin stays on screen: no Asleep screen, the brightness and the wake lock not touched.
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await page.waitForTimeout(500);
  expect(asked()).toEqual(['PUT /api/v1/machine/state/sleeping']);
  expect(gateway.decaidSettings.keepAwake).toBe(true);

  // The menu offers the wake in the place of the two sleeps.
  await openMenu(page);
  await expect(page.getByTestId('machine-sleep')).toHaveCount(0);
  await expect(page.getByTestId('app-sleep')).toHaveCount(0);
  await expect(page.getByTestId('wake-machine')).toHaveText('Wake machine');
  await page.screenshot({ path: 'docs/product/home-menu-asleep.png' });
  await page.getByTestId('wake-machine').click();
  await expect.poll(asked).toEqual(['PUT /api/v1/machine/state/sleeping', 'PUT /api/v1/machine/state/idle']);
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await openMenu(page);
  await expect(page.getByTestId('machine-sleep')).toBeEnabled();
  await expect(page.getByTestId('wake-machine')).toHaveCount(0);
  await page.getByTestId('menu-backdrop').click();

  // Woken elsewhere (the machine's button): the next sleep Decaid starts shows the Asleep screen.
  await openMenu(page);
  await page.getByTestId('machine-sleep').click();
  await expect(page.getByTestId('status-title')).toHaveText('Asleep');
  gateway.state = 'idle';
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  gateway.state = 'sleeping';
  await expect(page.getByTestId('asleep')).toBeVisible();
  await expect
    .poll(asked)
    .toEqual([
      'PUT /api/v1/machine/state/sleeping',
      'PUT /api/v1/machine/state/idle',
      'PUT /api/v1/machine/state/sleeping',
      'PUT /api/v1/display/brightness {"brightness":5}',
    ]);
  expect(errors).toEqual([]);
});

test('machine and app sleep: sleeping and the Asleep screen at 5, a touch wakes and puts 100 back; the wake lock is not touched (spec 3.10, acceptance 56)', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  gateway.display = { ...gateway.display, wakeLockOverride: true };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  const asked = askedOf(gateway, gateway.requests.length);
  await openMenu(page);
  await page.getByTestId('app-sleep').click();
  await expect(page.getByTestId('asleep')).toBeVisible();
  await expect(page.getByTestId('asleep')).toContainText('touch to wake');
  await expect.poll(asked).toEqual(['PUT /api/v1/machine/state/sleeping', 'PUT /api/v1/display/brightness {"brightness":5}']);

  await page.touchscreen.tap(1200, 760);
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  await expect
    .poll(asked)
    .toEqual([
      'PUT /api/v1/machine/state/sleeping',
      'PUT /api/v1/display/brightness {"brightness":5}',
      'PUT /api/v1/machine/state/idle',
      'PUT /api/v1/display/brightness {"brightness":100}',
    ]);
  expect(gateway.display.wakeLockOverride).toBe(true);
  expect(gateway.decaidSettings.keepAwake).toBe(true);
  expect(gateway.display.requestedBrightness).toBe(100);

  // The next 'Machine sleep' is the machine's alone: no Asleep screen, no dimming.
  await openMenu(page);
  await page.getByTestId('machine-sleep').click();
  await expect(page.getByTestId('status-title')).toHaveText('Asleep');
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(asked().slice(4)).toEqual(['PUT /api/v1/machine/state/sleeping']);
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
  await expect(page.getByTestId('wake-machine')).toHaveCount(0);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  expect(errors).toEqual([]);
});
