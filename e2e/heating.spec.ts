import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The DE1 says idle while it heats; the header says Heating (a red light) until the page's heater is
// 3 °C under its target: home and hot water the group's, the steam page the steam heater's.
// Once Idle it says Heating again only 4 °C under it; the steam page says Off, dim in the corner, with the heater off.
// The words read the filtered temperature (`smooth`): a step of more than 5 °C is taken
// at once, a smaller one is followed in about 1.5 s and comes near the frame's value but never quite
// onto it, so a small step goes a little past the border and the test waits for the state line to
// show it. The exact borders are unit tests (shell.test.ts).

/** the header's light, on the page that is shown */
const light = (page: Page) => page.locator('header.page-header');

test('home says Heating while the group heats, and Idle 3 °C under its target', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.groupTemperature = 70;
  await page.goto('/');
  const title = page.getByTestId('status');
  await expect(title).toHaveAttribute('data-state', 'Heating');
  await expect(light(page)).toHaveAttribute('data-light', 'heating');
  // A cold steam heater does not count on home.
  gateway.heatTo({ group: 89.9, steam: 60 });
  await expect(page.getByTestId('state-group')).toContainText('89.9');
  await expect(title).toHaveAttribute('data-state', 'Heating');
  gateway.heatTo({ group: 90.3 });
  await expect(page.getByTestId('state-group')).toContainText('90.3');
  await expect(title).toHaveAttribute('data-state', 'Idle');
  await expect(light(page)).toHaveAttribute('data-light', 'none');
  // A group that jitters at the border stays Idle, until it is 4 °C under its target.
  gateway.heatTo({ group: 89.2 });
  await expect(page.getByTestId('state-group')).toContainText('89.2', { timeout: 10_000 });
  await expect(title).toHaveAttribute('data-state', 'Idle');
  gateway.heatTo({ group: 88.9 });
  await expect(title).toHaveAttribute('data-state', 'Heating');
});

test('the steam page says Heating against the steam target, Idle from 3 °C under it and above it', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.steamTemperature = 120;
  await page.goto('/');
  const title = page.getByTestId('status');
  // Home waits for the group, which is warm.
  await expect(title).toHaveAttribute('data-state', 'Idle');
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await expect(title).toHaveAttribute('data-state', 'Heating');
  await expect(light(page)).toHaveAttribute('data-light', 'heating');
  gateway.heatTo({ steam: 146.9 });
  await expect(page.getByTestId('state-steam')).toContainText('147');
  await expect(title).toHaveAttribute('data-state', 'Heating');
  gateway.heatTo({ steam: 147.5 });
  await expect(title).toHaveAttribute('data-state', 'Idle');

  // A boiler hotter than target + 3 °C is ready too; at the border the word does not flip.
  gateway.heatTo({ steam: 158 });
  await expect(page.getByTestId('state-steam')).toContainText('158');
  await expect(title).toHaveAttribute('data-state', 'Idle');
  gateway.heatTo({ steam: 146.5 });
  await expect(page.getByTestId('state-steam')).toContainText('147');
  await expect(title).toHaveAttribute('data-state', 'Idle');
  gateway.heatTo({ steam: 145.5 });
  await expect(title).toHaveAttribute('data-state', 'Heating');
});

test('the steam page says Off in the corner, dim and without an action, while the steam heater is off', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.steamTemperature = 32;
  gateway.setMachineSteamTarget(0);
  await page.goto('/');
  const title = page.getByTestId('status');
  // Home waits for the group, which is warm.
  await expect(title).toHaveAttribute('data-state', 'Idle');
  await expect(page.getByTestId('status-word')).toHaveCount(0);
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await expect(title).toHaveAttribute('data-state', 'Off');
  const word = page.getByTestId('status-word');
  await expect(word).toHaveText('Off');
  await expect(light(page)).toHaveAttribute('data-light', 'none');
  // dim, and not a button
  const dim = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dim').trim());
  expect(await word.evaluate((el) => el.tagName)).toBe('SPAN');
  expect(await word.evaluate((el) => getComputedStyle(el).color)).toBe(
    await page.evaluate((c) => {
      const probe = document.createElement('i');
      probe.style.color = c;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, dim),
  );
  // On again, the cold heater heats; the heater and not the machine's state says so.
  gateway.setMachineSteamTarget(150);
  await expect(title).toHaveAttribute('data-state', 'Heating');
  await expect(page.getByTestId('status-word')).toHaveCount(0);
  await expect(light(page)).toHaveAttribute('data-light', 'heating');
});

test('the hot water page waits for the group as home does: Heating, Hot water while it pours, Idle', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.groupTemperature = 70;
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  const title = page.getByTestId('screen-hot-water').getByTestId('status');
  await expect(title).toHaveAttribute('data-state', 'Heating');
  await expect(page.getByTestId('screen-hot-water').locator('header.page-header')).toHaveAttribute('data-light', 'heating');
  // A cold steam heater does not count here either.
  gateway.heatTo({ group: 90, steam: 60 });
  await expect(title).toHaveAttribute('data-state', 'Idle');

  gateway.waterFor('hotWater', 3, 4);
  await expect(title).toHaveAttribute('data-state', 'Hot water');
  gateway.waterEnded();
  await expect(title).toHaveAttribute('data-state', 'Idle');
  // Cooled by the water, the group heats again.
  gateway.heatTo({ group: 85 });
  await expect(title).toHaveAttribute('data-state', 'Heating');
});
