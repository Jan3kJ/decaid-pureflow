import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The settings page in glass: the category column is text on glass and the chosen category glows,
// rows are faint lines, fields are a bottom line, buttons have no fill. It writes
// test-results/settings-glass-*.png for the commit.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

async function openSettings(page: Page) {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-content')).toBeVisible();
}

test('the category column is text on glass and the chosen category glows', async ({ page }) => {
  await openSettings(page);
  await page.getByTestId('settings-category-calibration').click();
  const look = async (id: string) =>
    page.getByTestId(`settings-category-${id}`).evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        image: style.backgroundImage,
        border: style.borderTopColor,
        shadow: style.boxShadow,
      };
    });
  const rest = await look('machine');
  expect(rest.background).toBe('rgba(0, 0, 0, 0)');
  expect(rest.image).toBe('none');
  expect(rest.border).toBe('rgba(0, 0, 0, 0)');
  expect(rest.shadow).toBe('none');
  const chosen = await look('calibration');
  expect(chosen.shadow).not.toBe('none');
  const tree = await page.locator('nav.tree').evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(tree).toContain('gradient');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/settings-glass-calibration.png' });
});

test('machine: rows are faint lines and the value button has no fill', async ({ page }) => {
  await openSettings(page);
  await page.getByTestId('settings-category-machine').click();
  const value = page.locator('button.value').first();
  await expect(value).toBeVisible();
  const look = await value.evaluate((node) => {
    const style = getComputedStyle(node);
    return { image: style.backgroundImage, color: style.backgroundColor, border: style.borderTopColor };
  });
  expect(look.image).toBe('none');
  expect(look.color).toBe('rgba(0, 0, 0, 0)');
  expect(look.border).toBe('rgba(255, 255, 255, 0.07)');
  await page.screenshot({ path: 'test-results/settings-glass-machine.png' });
});

test('a confirm dialog is glass', async ({ page }) => {
  await openSettings(page);
  await page.getByTestId('settings-category-calibration').click();
  await page.getByTestId('setting-heater-voltage-230').click();
  await expect(page.getByTestId('settings-confirm')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/settings-glass-confirm.png' });
});
