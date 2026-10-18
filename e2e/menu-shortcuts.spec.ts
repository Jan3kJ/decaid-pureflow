import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// Acceptance item 18 (spec 3.7, R4) against a mocked gateway: the home menu's steam switch
// writes the workflow's steam temperature (0 is off) and shows the heater's state; machine off
// is sleep, as Decaid cannot switch the DE1 off (research.md 22). The same against the
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
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pureflow.settings') ?? '{}'));
  expect(stored.steam.heaterTemperature).toBe(158);
  await expect
    .poll(() => (gateway.store['pureflow/settings-backup'] as any)?.settings?.steam?.heaterTemperature, { timeout: 10_000 })
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
  await expect.poll(() => gateway.calls('POST', '/api/v1/machine/shotSettings').map((call) => call.body.targetSteamTemp)).toEqual([150]);
  await openMenu(page);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  expect(errors).toEqual([]);
});

test('machine off is labelled as sleep and sends the state sleeping (item 18)', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await openMenu(page);
  await expect(page.getByTestId('machine-off')).toContainText('Machine off');
  await expect(page.getByTestId('machine-off-detail')).toHaveText('sleeps: Decaid cannot switch the DE1 off');
  await page.getByTestId('machine-off').click();
  await expect.poll(() => gateway.calls('PUT', /^\/api\/v1\/machine\/state\//).map((call) => call.path)).toEqual([
    '/api/v1/machine/state/sleeping',
  ]);
  await expect(page.getByTestId('asleep')).toBeVisible();
  expect(errors).toEqual([]);
});

test('without a machine the steam switch is offered from the workflow, machine off is not', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.machineConnected = false;
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('No machine connected', { timeout: 10_000 });
  await openMenu(page);
  await expect(page.getByTestId('machine-off')).toBeDisabled();
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('steam heater is on');
  expect(errors).toEqual([]);
});
