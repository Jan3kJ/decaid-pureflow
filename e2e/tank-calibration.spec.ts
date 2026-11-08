import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';
import { back } from './touch';

// Quick Adjustments > Tank calibration against the mocked gateway: the tank's level
// (`/ws/v1/machine/waterLevels`) is set step by step as if water were poured, the page takes a
// row once the level is steady for 5 s, refuses a step that rose too little, saves the rows with
// 'done', and the state line, the water alert's note and the clean's water follow them; 'back to
// decent's table' gives the table again. The 5 s are waited for: a clock run ahead makes the
// machine's frames look old, and the skin then has no level.

const errors: string[] = [];
let gateway: MockGateway;

// Each step waits the page's 5 s.
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
  // A tank with water in it, to be emptied first; the alert at 15 mm.
  gateway.water = { currentLevel: 30, refillLevel: 15 };
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openCalibration(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', 'quickadjustments');
  await page.getByTestId('settings-sub-tankcalibration').click();
  await expect(page.getByTestId('tank-calibration')).toBeInViewport();
}

/** The level settles at `mm` and stays there for the 5 s the page waits. */
async function settle(page: Page, mm: number) {
  gateway.setWater(mm);
  await expect(page.getByTestId('tank-calibration-level')).toHaveText(`${mm.toFixed(1)} mm`);
  await expect(page.getByTestId('tank-calibration-next')).toBeDisabled();
  await expect(page.getByTestId('tank-calibration-steady')).toHaveText('steady', { timeout: 10_000 });
}

test("a fill of four pours makes the skin use the user's own table, and the way back gives Decent's", async ({ page }) => {
  await openCalibration(page);
  const fill = page.getByTestId('tank-calibration');
  await expect(fill.getByTestId('tank-calibration-using')).toHaveText("Decent's table");
  await expect(fill).toContainText('1 g = 1 ml');
  await expect(fill).toContainText('about 30 ml');
  await expect(fill.getByTestId('tank-calibration-back')).toHaveCount(0);

  // The empty tank, then 250 ml at a time.
  await expect(fill).toContainText('the tank empty.');
  await settle(page, 0.4);
  await fill.getByTestId('tank-calibration-next').click();
  await expect(fill).toContainText('pour until 250 ml in all.');

  // A level that has not risen enough is refused, and nothing is taken.
  await settle(page, 2.0);
  await fill.getByTestId('tank-calibration-next').click();
  await expect(fill.getByTestId('tank-calibration-message')).toHaveText(
    'The level rose 1.6 mm, less than 3 mm: let the water settle, or check that 250 ml went in.',
  );
  await expect(fill.getByTestId('tank-calibration-row')).toHaveCount(1);

  for (const mm of [9.8, 19.1, 27.5]) {
    await settle(page, mm);
    await fill.getByTestId('tank-calibration-next').click();
    await expect(fill.getByTestId('tank-calibration-message')).toHaveCount(0);
  }
  await expect(fill.getByTestId('tank-calibration-done')).toHaveCount(0);
  await settle(page, 35.6);
  await fill.getByTestId('tank-calibration-next').click();
  await expect(fill.getByTestId('tank-calibration-row')).toHaveText([
    /0 ml\s*0\.4 mm/,
    /250 ml\s*9\.8 mm/,
    /500 ml\s*19\.1 mm/,
    /750 ml\s*27\.5 mm/,
    /1000 ml\s*35\.6 mm/,
  ]);
  await expect(fill).toContainText('pour until 1250 ml in all.');
  // Nothing applies until 'done'.
  await expect(fill.getByTestId('tank-calibration-using')).toHaveText("Decent's table");
  await page.screenshot({ path: 'docs/product/tank-calibration.png' });

  await fill.getByTestId('tank-calibration-done').click();
  await expect(fill.getByTestId('tank-calibration-using')).toHaveText('your table, 5 rows to 1000 ml');
  await expect(fill.getByTestId('tank-calibration-message')).toHaveText('Saved: your table, 5 rows to 1000 ml.');
  await expect(fill.getByTestId('tank-calibration-row')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pureflow.settings') ?? '{}') as { tankRows: unknown });
  expect(stored.tankRows).toEqual([
    { mm: 0.4, ml: 0 },
    { mm: 9.8, ml: 250 },
    { mm: 19.1, ml: 500 },
    { mm: 27.5, ml: 750 },
    { mm: 35.6, ml: 1000 },
  ]);

  // The water alert's note follows the rows; the alert itself stays in mm. 15 mm: 250 + 5.2 / 9.3 x 250 ml.
  await expect(page.getByTestId('setting-water-alert').locator('b')).toHaveText('15mm, about 390 ml');

  // 14 mm: 363 ml by the rows, 371 ml by the table; the state line and the clean agree.
  gateway.setWater(14);
  await page.getByTestId('settings-category-maintenance').click();
  await expect(page.getByTestId('maintenance-water-clean')).toHaveText('water tank: 363 ml');
  await back(page);
  await expect(page.getByTestId('state-tank')).toHaveText('360 ml');

  // Back to Decent's table: the rows go, the table's ml come back.
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-quickadjustments').click();
  await page.getByTestId('settings-sub-tankcalibration').click();
  await fill.getByTestId('tank-calibration-back').click();
  await expect(fill.getByTestId('tank-calibration-using')).toHaveText("Decent's table");
  await expect(fill.getByTestId('tank-calibration-back')).toHaveCount(0);
  expect(
    await page.evaluate(() => (JSON.parse(localStorage.getItem('pureflow.settings') ?? '{}') as { tankRows: unknown }).tankRows),
  ).toEqual([]);
  await back(page);
  await expect(page.getByTestId('state-tank')).toHaveText('370 ml');
});

test("'start again' drops the fill, and leaving the page keeps what was saved before", async ({ page }) => {
  await openCalibration(page);
  const fill = page.getByTestId('tank-calibration');
  await settle(page, 0.4);
  await fill.getByTestId('tank-calibration-next').click();
  await settle(page, 9.8);
  await fill.getByTestId('tank-calibration-next').click();
  await expect(fill.getByTestId('tank-calibration-row')).toHaveCount(2);
  await fill.getByTestId('tank-calibration-again').click();
  await expect(fill.getByTestId('tank-calibration-row')).toHaveCount(0);
  await expect(fill).toContainText('the tank empty.');

  // The level has stood still since: the row is taken at once.
  await fill.getByTestId('tank-calibration-next').click();
  await expect(fill.getByTestId('tank-calibration-row')).toHaveText([/0 ml\s*9\.8 mm/]);
  await back(page);
  await expect(page.getByTestId('state-tank')).toHaveText('260 ml');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('tank-calibration-row')).toHaveCount(0);
  await expect(page.getByTestId('tank-calibration-using')).toHaveText("Decent's table");
});
