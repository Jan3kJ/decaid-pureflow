import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// The menu's clean
// against the mocked gateway: home's menu opens the settings page on Maintenance with the clean,
// which shows the tank's water in ml from `/ws/v1/machine/waterLevels`, warns under 350 ml and
// says to empty the drip tray. The same against the running gateway: e2e-rig/menu-clean.spec.ts.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openClean(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('open-clean')).toContainText('Clean');
  await page.getByTestId('open-clean').click();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', 'maintenance');
  await expect(page.getByTestId('maintenance-clean')).toBeInViewport();
}

test("the menu's clean opens Maintenance's clean with the water in ml and the drip tray hint", async ({ page }) => {
  // The settings page opened last on another category: the shortcut still opens Maintenance.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('pureflow.settings-location', 'skin');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openClean(page);
  // 38 mm is 1042 ml in Streamline's table.
  await expect(page.getByTestId('maintenance-water-clean')).toHaveText('Water tank: 1042 ml');
  await expect(page.getByTestId('maintenance-water-low-clean')).toHaveCount(0);
  await expect(page.getByTestId('maintenance-drip-tray-clean')).toHaveText('Empty the drip tray before starting.');
  await expect(page.getByTestId('maintenance-start-clean')).toBeEnabled();
  // Only the clean says so: the descale and transport mode do not use the tank this way.
  await expect(page.getByTestId('maintenance-water-descale')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/menu-clean.png' });
});

test('under 350 ml the clean warns, and the warning goes when the tank is filled; Start still asks', async ({ page }) => {
  // 13 mm is 343 ml.
  gateway.water = { ...gateway.water, currentLevel: 13 };
  await openClean(page);
  await expect(page.getByTestId('maintenance-water-clean')).toHaveText('Water tank: 343 ml');
  await expect(page.getByTestId('maintenance-water-low-clean')).toHaveText(
    'Under 350 ml: a clean uses about 300 ml. Fill the tank first.',
  );
  await page.screenshot({ path: 'docs/product/menu-clean-low.png' });

  // 14 mm is 371 ml: over 350, no warning.
  gateway.setWater(14);
  await expect(page.getByTestId('maintenance-water-clean')).toHaveText('Water tank: 371 ml');
  await expect(page.getByTestId('maintenance-water-low-clean')).toHaveCount(0);

  // The warning does not block Start: the confirm comes as without it.
  gateway.setWater(13);
  await expect(page.getByTestId('maintenance-water-low-clean')).toBeVisible();
  await page.getByTestId('maintenance-start-clean').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('blind basket');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('PUT', /^\/api\/v1\/machine\/state\//)).toHaveLength(0);
});
