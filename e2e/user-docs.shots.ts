import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile, type MockGateway } from './mock-gateway';
import { toPage } from './touch';

// The pictures of the user documentation (spec 3.13, 'User documentation: plan'; acceptance 83):
// `npm run screenshots` writes the eight into docs/user/img/, on the mock gateway at the design
// target. Every name in them is invented here: no real bean, roaster, device or address.

const IMG = 'docs/user/img';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  // A fixed day for the history's dates and the date picker; timers run as they do.
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const BEAN = { coffeeName: 'House Blend', coffeeRoaster: 'Example Roasters' };
const OTHER = { coffeeName: 'Washed Single Origin', coffeeRoaster: 'Sample Coffee Co' };

/**
 * A catalogue of two beans and one grinder, the A-Flow defaults with medium loaded and the first
 * bean on it, and with `shots` the history's three entries.
 */
async function gatewayFor(page: Page, shots = true): Promise<MockGateway> {
  const gateway = (await mockGateway(page)).withDefaults('medium');
  gateway.workflow.context = { ...gateway.workflow.context, ...BEAN, grinderModel: 'Hand grinder', grinderSetting: '5.5' };
  const at = '2026-10-18T10:00:00.000';
  gateway.beans = [
    { id: 'b1', name: BEAN.coffeeName, roaster: BEAN.coffeeRoaster, decaf: false, archived: false, createdAt: at, updatedAt: at },
    { id: 'b2', name: OTHER.coffeeName, roaster: OTHER.coffeeRoaster, decaf: false, archived: false, createdAt: at, updatedAt: at },
  ];
  gateway.grinders = [
    { id: 'g1', model: 'Hand grinder', archived: false, settingType: 'numeric', settingSmallStep: 0.5, createdAt: at, updatedAt: at },
  ];
  if (!shots) return gateway;
  const medium = profile('A-Flow / default-medium', 42, 9);
  gateway.addShot('shot-1', '2026-10-17T08:00:00.000000', medium, { ...BEAN, targetYield: 42, grinderSetting: '5.5' });
  gateway.addShot('shot-2', '2026-10-18T08:00:00.000000', medium, { ...OTHER, targetYield: 42, grinderSetting: '6.0' });
  gateway.addShot('shot-3', '2026-10-19T08:00:00.000000', profile('Best practice', 40, 4), {
    ...BEAN,
    targetYield: 40,
    grinderSetting: '5.0',
  });
  return gateway;
}

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

/** Waits for transitions and the graph's drawing to settle, then writes the picture. */
async function shoot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/${name}.png`, animations: 'disabled', caret: 'hide' });
}

test('home idle, home during a shot, and the swipe row', async ({ page }) => {
  // No shot in the history yet: home's empty graph, as on the first start (with one, home shows it).
  const gateway = await gatewayFor(page, false);
  await home(page);
  await expect(page.getByTestId('empty-graph')).toBeVisible();
  await shoot(page, 'home-idle');

  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  await expect(page.getByTestId('stop')).toBeEnabled();
  await page.screenshot({ path: `${IMG}/home-shot.png`, animations: 'disabled', caret: 'hide' });
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');

  // The row of pages under a finger, half way: home slides away, steam comes in from the right.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1000, y: 500 }] });
  for (let x = 980; x >= 360; x -= 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 500 }] });
    await page.waitForTimeout(15);
  }
  await expect(page.locator('.page')).toHaveCount(2);
  await shoot(page, 'swipe-row');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
});

test('the A-Flow editor', async ({ page }) => {
  await gatewayFor(page);
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('editor-profile')).toHaveText('medium');
  await shoot(page, 'editor');
});

test('the steam page during steaming', async ({ page }) => {
  const gateway = await gatewayFor(page);
  await home(page);
  await toPage(page, 'steam');
  gateway.putOnScale(420);
  await page.getByTestId('steam-set-timer').click();
  gateway.steamFor(15, true);
  await expect(page.getByTestId('steam-stop')).toBeVisible();
  await shoot(page, 'steam');
});

test('the history overlay', async ({ page }) => {
  await gatewayFor(page);
  await home(page);
  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history-entry')).toHaveCount(3);
  await shoot(page, 'history');
});

test('the bean pick', async ({ page }) => {
  await gatewayFor(page);
  await home(page);
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick')).toBeVisible();
  await page.getByTestId('pick-bean').filter({ hasText: OTHER.coffeeName }).click();
  await shoot(page, 'bean-pick');
});

test("the skin's settings", async ({ page }) => {
  await gatewayFor(page);
  await home(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('settings-steam')).toBeVisible();
  await shoot(page, 'settings-skin');
});
