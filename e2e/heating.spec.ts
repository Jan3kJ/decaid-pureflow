import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The DE1 says idle while it heats; the state line says Heating until the page's heater is
// 3 °C under its target: home and hot water the group's (spec 3.12), the steam page the steam heater's (spec 3.8).

test('home says Heating while the group heats, and Idle 3 °C under its target', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.groupTemperature = 70;
  await page.goto('/');
  const title = page.getByTestId('status-title');
  await expect(title).toHaveText('Heating');
  await expect(page.getByTestId('status')).toHaveClass(/busy/);
  // A cold steam heater does not count on home.
  gateway.heatTo({ group: 89.9, steam: 60 });
  await expect(title).toHaveText('Heating');
  gateway.heatTo({ group: 90 });
  await expect(title).toHaveText('Idle');
  await expect(page.getByTestId('status')).toHaveClass(/ok/);
});

test('the steam page says Heating against the steam target, not when the heater is off', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.steamTemperature = 120;
  await page.goto('/');
  const title = page.getByTestId('status-title');
  // Home waits for the group, which is warm.
  await expect(title).toHaveText('Idle');
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await expect(title).toHaveText('Heating');
  await expect(page.getByTestId('status')).toHaveClass(/busy/);
  gateway.heatTo({ steam: 146.9 });
  await expect(title).toHaveText('Heating');
  gateway.heatTo({ steam: 147 });
  await expect(title).toHaveText('Idle');

  // A heater that is off is not heating, however cold it is.
  gateway.heatTo({ steam: 40 });
  await expect(title).toHaveText('Heating');
  gateway.setMachineSteamTarget(0);
  await expect(title).toHaveText('Idle');
});

test('the hot water page waits for the group as home does: Heating, Hot water while it pours, Idle', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.groupTemperature = 70;
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  const title = page.getByTestId('screen-hot-water').getByTestId('status-title');
  await expect(title).toHaveText('Heating');
  await expect(page.getByTestId('screen-hot-water').getByTestId('status')).toHaveClass(/busy/);
  // A cold steam heater does not count here either.
  gateway.heatTo({ group: 90, steam: 60 });
  await expect(title).toHaveText('Idle');

  gateway.waterFor('hotWater', 3, 4);
  await expect(title).toHaveText('Hot water');
  gateway.waterEnded();
  await expect(title).toHaveText('Idle');
  // Cooled by the water, the group heats again.
  gateway.heatTo({ group: 85 });
  await expect(title).toHaveText('Heating');
});
