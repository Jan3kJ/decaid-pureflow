import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The DE1 says idle while it heats; the state line says Heating until the page's heater is
// 3 °C under its target: home the group's, the steam page the steam heater's (spec 3.8).

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
  await page.getByTestId('open-steam').click();
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await expect(title).toHaveText('Heating');
  await expect(page.getByTestId('status')).toHaveClass(/busy/);
  await expect(page.getByTestId('nav-status')).toHaveClass(/busy/);
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
