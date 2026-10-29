import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// Acceptance 134 (spec 3.18 item 9): the settings' adjust fields are signed as on the steam page,
// the page titles 'Settings' and 'Beans and grinders' are names like the other page headers, and
// the corner menu's 'Steam heater' says its state as a value, a tap switching it.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

async function openMenu(page: Page) {
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('menu-list')).toBeVisible();
}

/** The computed size and weight of a text. */
function face(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { size: style.fontSize, weight: style.fontWeight };
  });
}

test("the adjust fields read '−8 s', '−4 s', '+5 s', as the steam page's buttons", async ({ page }) => {
  await mockGateway(page);
  await home(page);
  await openMenu(page);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  for (const [index, number] of ['−8', '−4', '+5'].entries()) {
    const value = page.getByTestId(`setting-adjust-${index + 1}`).locator('b');
    // The number with its sign, and the unit in its own element after it, as every field has.
    await expect(value).toHaveText(`${number}s`);
    await expect(value.locator('i')).toHaveText('s');
  }
});

test("the titles 'Settings' and 'Beans and grinders' have the profile name's size and weight", async ({ page }) => {
  await mockGateway(page);
  await home(page);
  const name = await face(page.getByTestId('profile-name'));
  expect(name.weight).toBe('600');

  await openMenu(page);
  await page.getByTestId('open-settings').click();
  const settings = page.getByTestId('screen-settings').locator('h1');
  await expect(settings).toHaveText('Settings');
  expect(await face(settings)).toEqual(name);

  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'beans'));
  await page.goto('/');
  const beans = page.locator('h1', { hasText: 'Beans and grinders' });
  await expect(beans).toBeVisible();
  expect(await face(beans)).toEqual(name);
});

test("the menu says 'Steam heater' with 'on' or 'off', and a tap switches it", async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await openMenu(page);
  const entry = page.getByTestId('steam-heater');
  await expect(entry.locator('.label')).toHaveText('Steam heater');
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('on');
  // The state is the entry's value: on the same line, at its right end.
  const label = (await entry.locator('.label').boundingBox())!;
  const state = (await page.getByTestId('steam-heater-detail').boundingBox())!;
  expect(Math.abs(state.y + state.height - (label.y + label.height))).toBeLessThan(4);
  expect(state.x).toBeGreaterThan(label.x + label.width);

  await entry.click();
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(0);
  await openMenu(page);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('off');
  await page.getByTestId('steam-heater').click();
  await expect.poll(() => gateway.shotSettings.targetSteamTemp).toBe(150);
  await openMenu(page);
  await expect(page.getByTestId('steam-heater-detail')).toHaveText('on');
});
