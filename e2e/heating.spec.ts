import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The DE1 says idle while it heats; the state line says Heating until the page's heater is
// 3 °C under its target: home and hot water the group's (spec 3.12), the steam page the steam heater's (spec 3.8).
// Once Idle it says Heating again only 4 °C under it; the steam page says Off with the heater off (spec 3.12).

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
  // A group that jitters at the border stays Idle, until it is 4 °C under its target.
  gateway.heatTo({ group: 89.2 });
  await expect(page.getByTestId('state-group')).toContainText('89.2');
  await expect(title).toHaveText('Idle');
  gateway.heatTo({ group: 88.9 });
  await expect(title).toHaveText('Heating');
});

test('the steam page says Heating against the steam target, Idle from 3 °C under it and above it', async ({ page }) => {
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

  // A boiler hotter than target + 3 °C is ready too; at the border the word does not flip.
  gateway.heatTo({ steam: 158 });
  await expect(page.getByTestId('state-steam')).toContainText('158');
  await expect(title).toHaveText('Idle');
  gateway.heatTo({ steam: 146.5 });
  await expect(page.getByTestId('state-steam')).toContainText('147');
  await expect(title).toHaveText('Idle');
  gateway.heatTo({ steam: 145.5 });
  await expect(title).toHaveText('Heating');
});

test('the steam page says Off in the warning colour while the steam heater is off', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.steamTemperature = 32;
  gateway.setMachineSteamTarget(0);
  await page.goto('/');
  const title = page.getByTestId('status-title');
  // Home waits for the group, which is warm.
  await expect(title).toHaveText('Idle');
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await expect(title).toHaveText('Off');
  await expect(page.getByTestId('status')).toHaveClass(/heater-off/);
  const warn = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warn').trim());
  const color = await title.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe(
    await page.evaluate((c) => {
      const probe = document.createElement('i');
      probe.style.color = c;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, warn),
  );
  // On again, the cold heater heats; the heater and not the machine's state says so.
  gateway.setMachineSteamTarget(150);
  await expect(title).toHaveText('Heating');
  await expect(page.getByTestId('status')).not.toHaveClass(/heater-off/);
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
