import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Home's title stands at the right end of the header, on the same right edge as hot water's and steam's.

test('home title is right-aligned on the right edge of the hot water title, level with the header', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  const home = page.getByTestId('home-title');
  await expect(home).toHaveText('Home');
  const homeBox = (await home.boundingBox())!;
  const header = (await page.getByTestId('screen-home').locator('header.page-header').boundingBox())!;
  // the text itself ends at the box's right edge: right-aligned
  const textRight = await home.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().right;
  });
  expect(textRight).toBeCloseTo(homeBox.x + homeBox.width, 0);
  expect(homeBox.y + homeBox.height / 2).toBeCloseTo(header.y + header.height / 2, 0);
  await page.screenshot({ path: 'test-results/home-title-right-home.png' });

  await toPage(page, 'hot-water');
  const water = (await page.getByTestId('screen-hot-water').getByTestId('page-title').boundingBox())!;
  expect(Math.abs(water.x + water.width - (homeBox.x + homeBox.width))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/home-title-right-hot-water.png' });
});
