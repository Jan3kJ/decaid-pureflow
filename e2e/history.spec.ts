import { expect, test, type Page } from '@playwright/test';
import { WATER_FRAMES, mockGateway, profile, type MockGateway } from './mock-gateway';

// The shot history against a mocked gateway (D8b, acceptance item 5): an overlay on home,
// opened by its tab or by a swipe from the left edge, closed by a selection or a tap outside.
// An entry is one profile with one bean; tapping it restores profile, bean and grinder
// setting with one PUT of the workflow and shows the graph of its latest shot.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const LIGHT = profile('A-Flow / default-light', 48, 9);
const BEST = profile('Best practice', 40, 4);
const RED_BRICK = { coffeeName: 'Red Brick', coffeeRoaster: 'Square Mile' };
const YIRGACHEFFE = { coffeeName: 'Yirgacheffe', coffeeRoaster: 'Rig', grinderModel: 'Niche Zero' };

/** Four shots, three combinations of profile and bean. */
function fourShots(gateway: MockGateway) {
  gateway.addShot('shot-1', '2026-10-10T08:00:00.000000', LIGHT, { ...RED_BRICK, targetYield: 48, grinderSetting: '5.2' });
  gateway.addShot('shot-2', '2026-10-11T08:00:00.000000', LIGHT, { ...RED_BRICK, targetYield: 48, grinderSetting: '4.8' });
  gateway.addShot('shot-3', '2026-10-12T08:00:00.000000', LIGHT, { ...YIRGACHEFFE, targetYield: 48, grinderSetting: '6.0' });
  gateway.addShot('shot-4', '2026-10-12T09:00:00.000000', BEST, { targetDoseWeight: 18, targetYield: 40 });
}

/**
 * A finger's swipe, as the tablet's screen sends it: touch events through the browser's input,
 * over a quarter of a second. Sent with no time between them they are a fling so fast that
 * Chromium drops the tap that follows it (research.md, section 14).
 */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 8; i += 1) {
    const at = { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const written = (gateway: MockGateway) => gateway.calls('PUT', '/api/v1/workflow').map((call) => call.body);
const points = async (page: Page) =>
  Number(await page.getByTestId('history-graph').getByTestId('shot-graph').getAttribute('data-points'));

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

test('the tab opens the overlay: one entry per profile and bean, newest first, with the latest grinder setting', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);
  await expect(page.getByTestId('history')).toHaveCount(0);

  await page.getByTestId('nav-history').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  // An overlay, not a page: home is still under it.
  await expect(page.getByTestId('screen-home')).toBeVisible();

  const entries = page.getByTestId('history-entry');
  await expect(entries).toHaveCount(3);
  await expect(entries.getByTestId('entry-profile')).toHaveText([
    'Best practice',
    'A-Flow / default-light',
    'A-Flow / default-light',
  ]);
  await expect(entries.getByTestId('entry-bean')).toHaveText(['no bean', 'Rig · Yirgacheffe', 'Square Mile · Red Brick']);
  // The grinder setting is the latest shot's; the change from 5.2 to 4.8 made no new entry.
  await expect(entries.getByTestId('entry-grinder')).toHaveText(['', 'grinder 6.0', 'grinder 4.8']);
  await expect(entries.nth(2).getByTestId('entry-when')).toContainText('2 shots');
  await expect(entries.nth(2)).toHaveAttribute('data-shot', 'shot-2');

  // The list is read without measurements; nothing is written by opening it.
  expect(gateway.calls('GET', '/api/v1/shots')).toHaveLength(1);
  expect(gateway.calls('GET', /^\/api\/v1\/shots\/./)).toHaveLength(0);
  expect(written(gateway)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a swipe from the left edge to the right opens the overlay, and no other swipe does', async ({ page }) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);

  // From the middle of the screen, to the left, and down along the edge: nothing.
  await swipe(page, { x: 600, y: 400 }, { x: 900, y: 400 });
  await swipe(page, { x: 200, y: 400 }, { x: 20, y: 400 });
  await swipe(page, { x: 30, y: 200 }, { x: 60, y: 600 });
  await page.waitForTimeout(200);
  await expect(page.getByTestId('history')).toHaveCount(0);

  await swipe(page, { x: 10, y: 400 }, { x: 260, y: 420 });
  await expect(page.getByTestId('history')).toBeVisible();
  await expect(page.getByTestId('history-entry')).toHaveCount(3);

  // Beside the tab too, over the last shot's place.
  await page.touchscreen.tap(1100, 400);
  await expect(page.getByTestId('history')).toHaveCount(0);
  await swipe(page, { x: 120, y: 500 }, { x: 330, y: 500 });
  await expect(page.getByTestId('history')).toBeVisible();
  // The swipe pressed nothing and wrote nothing.
  expect(gateway.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  expect(errors).toEqual([]);
});

test('a tap outside closes the overlay and changes nothing', async ({ page }) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);

  await page.getByTestId('nav-history').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  // Outside, where home has its start button: the tap closes the overlay and starts nothing.
  const start = (await page.getByTestId('start').boundingBox())!;
  await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);

  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
  expect(gateway.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  // A tap inside the panel that hits no entry leaves it open.
  await page.getByTestId('nav-history').tap();
  await page.getByTestId('history').getByRole('heading').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tapping an entry closes the overlay, restores profile, bean and grinder setting and shows its graph', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-medium');

  await page.getByTestId('nav-history').tap();
  await page.getByTestId('history-entry').filter({ hasText: 'Red Brick' }).tap();
  await expect(page.getByTestId('history')).toHaveCount(0);

  // One PUT of the workflow: the profile of the entry's latest shot, its bean and its grinder
  // setting; what the shot did not have is cleared.
  await expect.poll(() => written(gateway).length).toBe(1);
  expect(written(gateway)[0]).toEqual({
    profile: LIGHT,
    context: {
      coffeeName: 'Red Brick',
      coffeeRoaster: 'Square Mile',
      beanBatchId: null,
      grinderSetting: '4.8',
      grinderModel: null,
      grinderId: null,
      targetYield: 48,
    },
  });
  expect(gateway.calls('POST', '/api/v1/machine/profile')).toHaveLength(0);
  expect(gateway.workflow.profile).toEqual(LIGHT);
  expect(gateway.workflow.context).toEqual({
    targetDoseWeight: 18,
    targetYield: 48,
    grinderSetting: '4.8',
    coffeeName: 'Red Brick',
    coffeeRoaster: 'Square Mile',
  });

  // Home shows what is current now, and the graph of the last shot made with the entry.
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-light');
  await expect(page.getByTestId('target-weight')).toHaveText('48 g');
  await expect(page.getByTestId('history-graph')).toBeVisible();
  await expect(page.getByTestId('recalled-profile')).toHaveText('A-Flow / default-light');
  await expect(page.getByTestId('recalled-bean')).toHaveText('Square Mile · Red Brick');
  await expect(page.getByTestId('recalled-grinder')).toHaveText('grinder 4.8');
  expect(gateway.calls('GET', /^\/api\/v1\/shots\/./).map((call) => call.path)).toEqual(['/api/v1/shots/shot-2']);
  // One point per measurement from the first one in which water moves.
  expect(await points(page)).toBe(WATER_FRAMES);
  const graph = page.getByTestId('history-graph');
  for (const line of ['pressure', 'flow', 'weight', 'temperature']) {
    expect((await graph.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(100);
  }
  // The same colours as the editor and the live graph (spec 3.2).
  const colours = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const stroke = (line: string) =>
      getComputedStyle(document.querySelector(`[data-testid="history-graph"] [data-testid="shot-line-${line}"]`)!).stroke;
    const probe = document.createElement('i');
    document.body.append(probe);
    const rgb = (name: string) => {
      probe.style.color = style.getPropertyValue(name);
      return getComputedStyle(probe).color;
    };
    const result = ['flow', 'pressure', 'temperature'].map((line) => stroke(line) === rgb(`--${line}`));
    probe.remove();
    return result;
  });
  expect(colours).toEqual([true, true, true]);

  // The overlay over home with the restored entry's graph: the product's picture.
  await page.getByTestId('nav-history').tap();
  await expect(page.getByTestId('history-entry')).toHaveCount(3);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/product/history.png' });

  // An entry without a bean and a grinder setting clears both in the workflow.
  await page.getByTestId('history-entry').filter({ hasText: 'Best practice' }).tap();
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('recalled-bean')).toHaveText('no bean');
  await expect(page.getByTestId('recalled-grinder')).toHaveCount(0);
  expect(written(gateway)[1]).toEqual({
    profile: BEST,
    context: {
      coffeeName: null,
      coffeeRoaster: null,
      beanBatchId: null,
      grinderSetting: null,
      grinderModel: null,
      grinderId: null,
      targetYield: 40,
    },
  });
  expect(gateway.workflow.context).toEqual({ targetDoseWeight: 18, targetYield: 40 });
  await expect(page.getByTestId('profile-name')).toHaveText('Best practice');

  await page.getByTestId('dismiss-recalled').tap();
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a shot that starts closes the overlay, and its graph takes the place of the restored one', async ({ page }) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);
  await page.getByTestId('nav-history').tap();
  await page.getByTestId('history-entry').first().tap();
  await expect(page.getByTestId('history-graph')).toBeVisible();
  await page.getByTestId('nav-history').tap();
  await expect(page.getByTestId('history')).toBeVisible();

  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('screen-espresso')).toBeVisible();
  await expect(page.getByTestId('history')).toHaveCount(0);
  await gateway.replay(page, 0.3, 1);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the history is on home only: the editor has no tab, and its drags never open the overlay', async ({ page }) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);
  await page.getByTestId('open-editor').tap();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('nav-history')).toHaveCount(0);

  // The gesture that opens the history on home, with a finger and with the mouse.
  const graph = (await page.getByTestId('graph').boundingBox())!;
  await swipe(page, { x: 10, y: 400 }, { x: 300, y: 400 });
  await swipe(page, { x: graph.x + 20, y: graph.y + graph.height / 2 }, { x: graph.x + 320, y: graph.y + graph.height / 2 });
  await page.mouse.move(graph.x + 20, graph.y + graph.height / 2);
  await page.mouse.down();
  await page.mouse.move(graph.x + 320, graph.y + graph.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  expect(gateway.calls('GET', '/api/v1/shots')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a history without shots says so, and one the gateway cannot give says why', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await page.getByTestId('nav-history').tap();
  await expect(page.getByTestId('history-empty')).toHaveText('No shots yet.');
  await expect(page.getByTestId('history-entry')).toHaveCount(0);
  await page.touchscreen.tap(1100, 400);

  // A shot whose record is gone when the entry is tapped: the notice is on home.
  gateway.addShot('shot-9', '2026-10-12T09:00:00.000000', BEST, null);
  await page.getByTestId('nav-history').tap();
  gateway.shots = [];
  await page.getByTestId('history-entry').tap();
  await expect(page.getByTestId('notice')).toContainText('The entry was not restored');
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
});
