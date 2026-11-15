import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The steam page's 'set timer' button has the regular weight of the shared chip; the shared
// primary weight stays for the other primary buttons, the profile editor's save among them.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const weight = (node: Element) => getComputedStyle(node).fontWeight;

test("the steam 'set timer' button and its parts are regular, not bold", async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();

  const button = page.getByTestId('steam-set-timer');
  const chipWeight = await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.className = 'chip';
    document.body.append(probe);
    const found = getComputedStyle(probe).fontWeight;
    probe.remove();
    return found;
  });
  expect(chipWeight).toBe('400');

  expect(await button.evaluate(weight)).toBe(chipWeight);
  await expect(page.getByTestId('steam-set-timer')).toBeDisabled();

  gateway.putOnScale(525);
  await expect(page.getByTestId('steam-seconds')).toBeVisible();
  expect(await button.evaluate(weight)).toBe(chipWeight);
  expect(await page.getByTestId('steam-seconds').evaluate(weight)).toBe(chipWeight);
  await button.screenshot({ path: 'test-results/steam-set-timer.png' });
});

test('the shared primary weight stays 600 for the other primary buttons', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const found = await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.className = 'primary';
    document.body.append(probe);
    const result = getComputedStyle(probe).fontWeight;
    probe.remove();
    return result;
  });
  expect(found).toBe('600');
});
