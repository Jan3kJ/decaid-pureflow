import { expect, test, type Page } from '@playwright/test';
import { WATER_FRAMES, mockGateway, profile, type MockGateway } from './mock-gateway';
import { swipe } from './touch';

// The shot history against a mocked gateway (D8b, acceptance item 5): an overlay on home,
// opened by its handle or by a swipe from the left edge, closed by a selection or a tap outside.
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

const written = (gateway: MockGateway) => gateway.calls('PUT', '/api/v1/workflow').map((call) => call.body);
const points = async (page: Page) =>
  Number(await page.getByTestId('history-graph').getByTestId('shot-graph').getAttribute('data-points'));

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

test('the handle opens the overlay: one entry per profile and bean, newest first, with the latest grinder setting', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);
  await expect(page.getByTestId('history')).toHaveCount(0);

  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  // An overlay, not a page: home is still under it.
  await expect(page.getByTestId('screen-home')).toBeVisible();

  const entries = page.getByTestId('history-entry');
  await expect(entries).toHaveCount(3);
  await expect(entries.getByTestId('entry-profile')).toHaveText(['Best practice', 'A-Flow / default-light', 'A-Flow / default-light']);
  await expect(entries.getByTestId('entry-bean')).toHaveText(['no bean', 'Rig · Yirgacheffe', 'Square Mile · Red Brick']);
  // The grinder setting is the latest shot's, with its model where the shot names one; the change
  // from 5.2 to 4.8 made no new entry.
  await expect(entries.getByTestId('entry-grinder')).toHaveText(['', 'Niche Zero 6.0', 'grinder 4.8']);
  await expect(entries.nth(2).getByTestId('entry-when')).toContainText('2 shots');
  await expect(entries.nth(2)).toHaveAttribute('data-shot', 'shot-2');

  // The list is read once, after the start, without measurements; nothing is written by
  // opening it. (The workflow's profile has no shot, so the look-up of its last shot, spec 3.8,
  // reads no record.)
  expect(gateway.historyListCalls()).toHaveLength(1);
  expect(gateway.recordCalls()).toHaveLength(0);
  expect(written(gateway)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a swipe from the left edge to the right opens the overlay, and no other swipe does', async ({ page }) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);

  // From the middle of the screen and to the left: a page (spec 3.8), not the history; down
  // along the edge: nothing.
  // Each step waits on the state the swipe ends in, the strip at rest with one page, not on time;
  // the back arrow is clicked, since Chromium may drop a tap that follows a swipe (research.md 14).
  const atRest = () => expect(page.locator('.page')).toHaveCount(1);
  await swipe(page, { x: 600, y: 400 }, { x: 900, y: 400 });
  await expect(page.locator('.page:not([inert]) [data-testid="screen-hot-water"]')).toBeVisible();
  await atRest();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  // To the left from the left fifth: a page's swipe, too short to move on unless flicked.
  await swipe(page, { x: 200, y: 400 }, { x: 20, y: 400 });
  await atRest();
  await expect(page.getByTestId('history')).toHaveCount(0);
  if (await page.getByTestId('nav-home').count()) await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await swipe(page, { x: 30, y: 200 }, { x: 60, y: 600 });
  await atRest();
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('screen-home')).toBeVisible();

  await swipe(page, { x: 10, y: 400 }, { x: 260, y: 420 });
  await expect(page.getByTestId('history')).toBeVisible();
  await expect(page.getByTestId('history-entry')).toHaveCount(3);

  // Beside the handle too, over the last shot's place.
  await page.touchscreen.tap(1100, 400);
  await expect(page.getByTestId('history')).toHaveCount(0);
  await swipe(page, { x: 120, y: 500 }, { x: 330, y: 500 });
  await expect(page.getByTestId('history')).toBeVisible();
  // The swipe pressed nothing and wrote nothing.
  expect(gateway.writes()).toEqual([]);
  expect(errors).toEqual([]);
});

test('a tap outside closes the overlay and changes nothing', async ({ page }) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);

  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  // Outside, on home's menu button: the tap closes the overlay and opens nothing.
  const menu = (await page.getByTestId('menu').boundingBox())!;
  await page.touchscreen.tap(menu.x + menu.width / 2, menu.y + menu.height / 2);
  await expect(page.getByTestId('menu-list')).toHaveCount(0);

  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
  expect(gateway.writes()).toEqual([]);
  // A tap inside the panel that hits no entry leaves it open.
  await page.getByTestId('history-handle').tap();
  await page.getByTestId('history').getByRole('heading').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tapping an entry closes the overlay, restores profile, bean and grinder setting and shows its graph', async ({ page }) => {
  const gateway = await mockGateway(page);
  fourShots(gateway);
  await home(page);
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-medium');

  await page.getByTestId('history-handle').tap();
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
  // The stop weight is not on home: the workflow holds it.
  expect(gateway.workflow.context.targetYield).toBe(48);
  await expect(page.getByTestId('history-graph')).toBeVisible();
  await expect(page.getByTestId('recalled-profile')).toHaveText('A-Flow / default-light');
  await expect(page.getByTestId('recalled-bean')).toHaveText('Square Mile · Red Brick');
  await expect(page.getByTestId('recalled-grinder')).toHaveText('grinder 4.8');
  // The entry's latest shot is read for its graph; the restored profile's newest shot (shot-3,
  // another bean) may be read for the next shot's time axis (spec 3.8), nothing else.
  const read = gateway.recordCalls().map((call) => call.path);
  expect(read).toContain('/api/v1/shots/shot-2');
  expect(read.filter((path) => path !== '/api/v1/shots/shot-2' && path !== '/api/v1/shots/shot-3')).toEqual([]);
  // One point per measurement from the first one in which water moves.
  expect(await points(page)).toBe(WATER_FRAMES);
  const graph = page.getByTestId('history-graph');
  for (const line of ['pressure', 'flow', 'weight-flow', 'temperature']) {
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
    // The weight flow is yellow, the weight's colour (founder, 2026-10-14).
    result.push(stroke('weight-flow') === rgb('--weight'));
    probe.remove();
    return result;
  });
  expect(colours).toEqual([true, true, true, true]);

  // The overlay over home with the restored entry's graph: the product's picture.
  await page.getByTestId('history-handle').tap();
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
  await page.getByTestId('history-handle').tap();
  await page.getByTestId('history-entry').first().tap();
  await expect(page.getByTestId('history-graph')).toBeVisible();
  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history')).toBeVisible();

  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('shot-plot')).toBeVisible();
  await expect(page.getByTestId('history')).toHaveCount(0);
  await gateway.replay(page, 0.3, 1);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the history is on home only: the editor has no handle, and its drags never open the overlay', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  fourShots(gateway);
  await home(page);
  await page.getByTestId('open-editor').tap();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('history-handle')).toHaveCount(0);

  // The gesture that opens the history on home, on the graph with a finger and with the mouse:
  // the graph's drags.
  const graph = (await page.getByTestId('graph').boundingBox())!;
  await swipe(page, { x: graph.x + 20, y: graph.y + graph.height / 2 }, { x: graph.x + 320, y: graph.y + graph.height / 2 });
  await page.mouse.move(graph.x + 20, graph.y + graph.height / 2);
  await page.mouse.down();
  await page.mouse.move(graph.x + 320, graph.y + graph.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  // From the left edge, off the graph: the editor's swipe home (spec 3.10), not the history.
  await swipe(page, { x: 10, y: 400 }, { x: 300, y: 400 });
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('history')).toHaveCount(0);
  // The list was read once, after the start, and not again.
  expect(gateway.historyListCalls()).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a history without shots says so, and one the gateway cannot give says why', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history-empty')).toHaveText('No shots yet.');
  await expect(page.getByTestId('history-entry')).toHaveCount(0);
  await page.touchscreen.tap(1100, 400);

  // A shot whose record is gone when the entry is tapped: the notice is on home.
  // A shot made by another client is read when the overlay opens again.
  gateway.addShot('shot-9', '2026-10-12T09:00:00.000000', BEST, null);
  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history-entry')).toHaveCount(1);
  gateway.shots = [];
  await page.getByTestId('history-entry').tap();
  await expect(page.getByTestId('notice')).toContainText('The entry was not restored');
  await expect(page.getByTestId('history-graph')).toHaveCount(0);
});

test('a slow, long history: the newest 20 first, the rest after them, kept for a second opening and a new shot', async ({ page }) => {
  const gateway = await mockGateway(page);
  // 150 shots with 40 profiles: the newest 20 shots have 20 of them, all have 40.
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 8, minute)).toISOString().replace('Z', '000');
  for (let i = 0; i < 150; i++) gateway.addShot(`shot-${i}`, at(i), profile(`P${String(i % 40).padStart(2, '0')}`, 36, 4), null);
  let release!: () => void;
  gateway.olderShots = new Promise((resolve) => (release = resolve));
  await home(page);

  await page.getByTestId('history-handle').tap();
  const entries = page.getByTestId('history-entry');
  await expect(entries).toHaveCount(20);
  await expect(page.getByTestId('history-more')).toBeVisible();
  const first = await entries.getByTestId('entry-profile').allTextContents();
  expect(first[0]).toBe('P29');
  await page.screenshot({ path: 'e2e/.results/history-first-20.png' });
  // The finger is on the list: where it is scrolled to stays when the rest arrive.
  await page.getByTestId('history-list').evaluate((list) => (list.scrollTop = 200));

  release();
  await expect(entries).toHaveCount(40);
  await expect(page.getByTestId('history-more')).toHaveCount(0);
  expect((await entries.getByTestId('entry-profile').allTextContents()).slice(0, 20)).toEqual(first);
  expect(await page.getByTestId('history-list').evaluate((list) => list.scrollTop)).toBe(200);
  await expect(entries.first().getByTestId('entry-when')).toContainText('4 shots');
  expect(gateway.historyListCalls().map((call) => call.query)).toEqual([
    '?limit=20&offset=0&order=desc',
    '?limit=100&offset=20&order=desc',
    '?limit=100&offset=120&order=desc',
  ]);

  // Opened again: all at once, and only the latest shot is asked for.
  await page.touchscreen.tap(1100, 400);
  await expect(page.getByTestId('history')).toHaveCount(0);
  const before = gateway.requests.length;
  await page.getByTestId('history-handle').tap();
  await expect(entries).toHaveCount(40, { timeout: 300 });
  await expect.poll(() => gateway.requests.slice(before).map((request) => request.path)).toContain('/api/v1/shots/latest');
  expect(gateway.requests.slice(before).filter((request) => request.path.startsWith('/api/v1/shots'))).toHaveLength(1);
  await page.touchscreen.tap(1100, 400);

  // A shot ends: its record, written a moment later, is added without reading the old ones.
  await gateway.replay(page);
  gateway.addShot('shot-new', at(200), profile('P-new', 36, 4), null);
  await expect.poll(() => gateway.historyListCalls().length, { timeout: 10_000 }).toBe(4);
  expect(gateway.historyListCalls().at(-1)!.query).toBe('?limit=20&offset=0&order=desc');
  await page.getByTestId('history-handle').tap();
  await expect(entries).toHaveCount(41);
  await expect(entries.first().getByTestId('entry-profile')).toHaveText('P-new');
  expect(gateway.historyListCalls()).toHaveLength(4);
  expect(errors).toEqual([]);
});

// Acceptance 52's last sentence (spec 3.9 item 19, research.md 29.6): the history filtered by a
// bean and a grinder of Decaid's catalogue, on the shots held; its entries with the catalogue's
// beans and grinders.
test('the filter by bean and grinder: the catalogue names the entries, a choice keeps its shots, all brings every entry back', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  const at = '2026-10-20T10:00:00.000';
  const stamps = { decaf: false, createdAt: at, updatedAt: at };
  gateway.beans = [
    // Renamed since its first bag; the first bag is archived.
    { id: 'bean-red', roaster: 'Square Mile', name: 'Red Brick Espresso', archived: false, ...stamps },
    { id: 'bean-yirga', roaster: 'Rig', name: 'Yirgacheffe', archived: true, ...stamps },
  ];
  gateway.batches = [
    { id: 'bag-red-1', beanId: 'bean-red', frozen: false, archived: true, createdAt: at, updatedAt: at },
    { id: 'bag-red-2', beanId: 'bean-red', frozen: false, archived: false, createdAt: at, updatedAt: at },
  ];
  gateway.grinders = [{ id: 'niche', model: 'Niche Zero', archived: false, settingType: 'numeric', createdAt: at, updatedAt: at }];
  // Red Brick under its old name and its new one, a bag each; Yirgacheffe from before the
  // catalogue, its name and roaster only; one shot without a bean. The older shots arrive later.
  gateway.addShot('shot-1', '2026-10-10T08:00:00.000000', LIGHT, { ...RED_BRICK, beanBatchId: 'bag-red-1', grinderSetting: '5.2' });
  gateway.addShot('shot-2', '2026-10-11T08:00:00.000000', LIGHT, {
    coffeeName: 'Red Brick Espresso',
    coffeeRoaster: 'Square Mile',
    beanBatchId: 'bag-red-2',
    grinderId: 'niche',
    grinderModel: 'Niche Zero',
    grinderSetting: '4.8',
  });
  gateway.addShot('shot-3', '2026-10-12T08:00:00.000000', LIGHT, { ...YIRGACHEFFE, grinderSetting: '6.0' });
  gateway.addShot('shot-4', '2026-10-12T09:00:00.000000', BEST, { targetDoseWeight: 18, targetYield: 40 });
  for (let i = 0; i < 20; i++) {
    gateway.addShot(`new-${i}`, `2026-10-13T08:${String(i).padStart(2, '0')}:00.000000`, BEST, { targetYield: 40 });
  }
  let release!: () => void;
  gateway.olderShots = new Promise((resolve) => (release = resolve));
  await home(page);

  await page.getByTestId('history-handle').tap();
  const entries = page.getByTestId('history-entry');
  await expect(entries).toHaveCount(1);
  await expect(page.getByTestId('filter-all')).toHaveClass(/on/);

  // A bean, chosen while the older shots are still being read: the catalogue's, archived ones too.
  await page.getByTestId('filter-bean').tap();
  await expect(page.getByTestId('filter-option')).toHaveText(['Square Mile · Red Brick Espresso', /^Rig · Yirgacheffe\s*archived$/]);
  await page.getByTestId('filter-option').first().tap();
  await expect(page.getByTestId('filter-bean')).toHaveText('Square Mile · Red Brick Espresso');
  await expect(page.getByTestId('history-empty')).toHaveText('Reading the shots …');
  // The older shots arrive and are filtered as they come: one entry across the rename and the bags.
  release();
  await expect(entries).toHaveCount(1);
  await expect(entries.getByTestId('entry-bean')).toHaveText('Square Mile · Red Brick Espresso');
  await expect(entries.getByTestId('entry-grinder')).toHaveText('Niche Zero 4.8');
  await expect(entries.getByTestId('entry-when')).toContainText('2 shots');
  await page.screenshot({ path: 'e2e/.results/history-filter-bean.png' });

  // The shot from before the catalogue, by its name and roaster.
  await page.getByTestId('filter-bean').tap();
  await page.getByTestId('filter-option').nth(1).tap();
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveAttribute('data-shot', 'shot-3');
  await expect(entries.getByTestId('entry-bean')).toHaveText('Rig · Yirgacheffe');

  // Bean and grinder together: Yirgacheffe's shot names the Niche by its model, not by an id.
  // Then 'any bean' leaves the grinder: the Niche's shots by id, and Yirgacheffe's by model.
  await page.getByTestId('filter-grinder').tap();
  await expect(page.getByTestId('filter-option')).toHaveText(['Niche Zero']);
  await page.getByTestId('filter-option').tap();
  await expect(page.getByTestId('filter-grinder')).toHaveText('Niche Zero');
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveAttribute('data-shot', 'shot-3');
  await page.getByTestId('filter-bean').tap();
  await page.getByTestId('filter-any').tap();
  await expect(page.getByTestId('filter-bean')).toHaveText('bean');
  await expect(entries).toHaveCount(2);
  await expect(entries.getByTestId('entry-bean')).toHaveText(['Rig · Yirgacheffe', 'Square Mile · Red Brick Espresso']);

  // The filter lasts while the skin runs: closed and opened again, it is still there.
  await page.touchscreen.tap(1100, 400);
  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('filter-grinder')).toHaveClass(/on/);
  await expect(entries).toHaveCount(2);

  // All: every entry back, the catalogue's bean by its current name.
  await page.getByTestId('filter-all').tap();
  await expect(page.getByTestId('filter-grinder')).toHaveText('grinder');
  await expect(entries).toHaveCount(3);
  await expect(entries.getByTestId('entry-bean')).toHaveText(['no bean', 'Rig · Yirgacheffe', 'Square Mile · Red Brick Espresso']);

  // The shots were read once: the filter asks the gateway for none, and nothing was written.
  expect(gateway.historyListCalls()).toHaveLength(2);
  expect(gateway.writes()).toEqual([]);
  expect(errors).toEqual([]);
});
