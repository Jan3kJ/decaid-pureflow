import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PROFILES } from '../src/aflow';
import { paramsMetadata, workflowProfile } from '../src/editor/storage';
import { WATER_FRAMES, mockGateway } from './mock-gateway';

// The shell against a mocked gateway: home, the profile picker and a replayed shot (D6).

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** Nothing reaches over the viewport and nothing scrolls. */
async function expectInsideViewport(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const outside = [...document.querySelectorAll('button, h1, section, aside, svg')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5);
    });
    return {
      scrolls: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight,
      outside: outside.map((element) => element.outerHTML.slice(0, 80)),
    };
  });
  expect(overflow).toEqual({ scrolls: false, outside: [] });
}

/** The menu of home's top right corner: a tap opens it. */
async function openMenu(page: Page) {
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('menu-list')).toBeVisible();
}

const points = async (page: Page) => Number(await page.getByTestId('shot-graph').getAttribute('data-points'));

test('home shows the state line the machine sent, the profile, and no start: the DE1 is started at the machine', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');

  await expect(page.getByTestId('screen-home')).toBeVisible();
  // One line: the state, group, steam, tank and scale, each read from a stream.
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('state-group')).toHaveText('92.6 °C');
  await expect(page.getByTestId('state-steam')).toHaveText('148 °C');
  await expect(page.getByTestId('state-tank')).toHaveText('38 mm');
  await expect(page.getByTestId('state-scale')).toHaveText('0.0 g');
  const line = (await page.getByTestId('status').boundingBox())!;
  expect(line.height).toBeLessThan(40);
  gateway.setWater(31);
  await expect(page.getByTestId('state-tank')).toHaveText('31 mm');

  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-medium');
  // Dose and stop weight are not on home; nothing starts a shot or steam here.
  await expect(page.getByTestId('dose')).toHaveCount(0);
  await expect(page.getByTestId('target-weight')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /start/ })).toHaveCount(0);
  await expect(page.getByTestId('stop')).toHaveCount(0);
  // No finished shot: the graph keeps its place, empty, and takes most of the screen.
  await expect(page.getByTestId('last-shot')).toHaveCount(0);
  const graph = (await page.getByTestId('empty-graph').boundingBox())!;
  expect(graph.width * graph.height).toBeGreaterThan(0.75 * 1280 * 800);
  await expectInsideViewport(page);
  expect(errors).toEqual([]);
});

test('the state line warns in place of the weight when the scale is not connected', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('state-scale')).toHaveText('0.0 g');

  gateway.connectScale(false);
  await expect(page.getByTestId('state-scale')).toHaveText('⚠ not connected');
  gateway.connectScale(true);
  gateway.putOnScale(12.3);
  await expect(page.getByTestId('state-scale')).toHaveText('12.3 g');
  expect(errors).toEqual([]);
});

test('the menu opens with settings and sleep, and closes on a choice and on a tap outside', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('menu-list')).toHaveCount(0);

  // A tap outside closes it and does nothing else.
  await openMenu(page);
  await expect(page.getByRole('menuitem')).toHaveText(['Settings', 'Sleep']);
  await expectInsideViewport(page);
  await page.screenshot({ path: 'docs/product/home-menu.png' });
  await page.mouse.click(400, 500);
  await expect(page.getByTestId('menu-list')).toHaveCount(0);
  await expect(page.getByTestId('screen-home')).toBeVisible();

  for (const [entry, screen] of [['open-settings', 'settings']]) {
    await openMenu(page);
    await page.getByTestId(entry).click();
    await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('menu-list')).toHaveCount(0);
  }

  await openMenu(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('menu-list')).toHaveCount(0);
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/sleeping').length).toBe(1);
  expect(errors).toEqual([]);
});

test('the pen opens the editor, the name the picker, the right tab the steam page', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');

  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-profiles').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await page.getByTestId('nav-home').click();

  // The steam tab is the mirror of the history's: down the right edge.
  const tab = (await page.getByTestId('open-steam').boundingBox())!;
  const history = (await page.getByTestId('nav-history').boundingBox())!;
  expect(tab.x + tab.width).toBeGreaterThan(1280 - 2);
  expect(Math.abs(tab.height - history.height)).toBeLessThan(2);
  await page.getByTestId('open-steam').click();
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  // The steam page has the same state line.
  await expect(page.getByTestId('state-tank')).toHaveText('38 mm');
  expect(errors).toEqual([]);
});

test('the way back to home is a large target in the accent colour', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  for (const button of ['open-profiles', 'open-editor', 'open-steam']) {
    await page.getByTestId(button).click();
    const back = page.getByTestId('nav-home');
    const box = (await back.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(56);
    expect(box.height).toBeGreaterThanOrEqual(56);
    // Light blue (founder, 2026-10-14), paler than the flow curve's #4da3ff; not green or red.
    expect(await back.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(159, 212, 240)');
    await back.click();
  }
  expect(errors).toEqual([]);
});

test("the settings page names the skin's version in its top right corner", async ({ page }) => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  const version = page.getByTestId('skin-version');
  await expect(version).toHaveText(`${manifest.name} ${manifest.version}`);

  // At the right of the top line, clear of the title and its line, and inside the viewport.
  const box = (await version.boundingBox())!;
  const screen = (await page.getByTestId('screen-settings').boundingBox())!;
  expect(box.y).toBeLessThan(screen.y + screen.height * 0.1);
  expect(screen.x + screen.width - (box.x + box.width)).toBeLessThan(screen.width * 0.05);
  for (const other of [page.locator('.settings h1'), page.locator('.settings header p')]) {
    const near = (await other.boundingBox())!;
    expect(near.x + near.width).toBeLessThanOrEqual(box.x);
  }
  await expectInsideViewport(page);
  expect(errors).toEqual([]);
});

test('home follows the machine: a running state offers stop, idle offers nothing', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.state = 'sleeping';
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Asleep');
  await expect(page.getByTestId('stop')).toHaveCount(0);

  gateway.state = 'steam';
  await expect(page.getByTestId('status-title')).toHaveText('Steam');
  await page.getByTestId('stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  gateway.state = 'idle';
  await expect(page.getByTestId('stop')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('home says when Decaid is not reachable', async ({ page }) => {
  await mockGateway(page, { gateway: false });
  await page.goto('/');

  await expect(page.getByTestId('status-title')).toHaveText('Decaid is not reachable');
  await expect(page.getByTestId('status-detail')).toContainText('http://localhost:8080');
  // Nothing was read, so no value is shown.
  await expect(page.getByTestId('state-group')).toHaveCount(0);
  await expect(page.getByTestId('profile-name')).toHaveText('–');
});

test('home says when no machine is connected, and shows the machine when it comes', async ({ page }) => {
  const gateway = await mockGateway(page, { machine: false });
  await page.goto('/');

  // The gateway answers and its stream is silent.
  await expect(page.getByTestId('status-title')).toHaveText('No machine connected', { timeout: 8000 });
  await expect(page.getByTestId('state-group')).toHaveCount(0);
  // The workflow is the gateway's, with or without a machine.
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-medium');

  gateway.machineConnected = true;
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('state-group')).toHaveText('92.6 °C');
  expect(errors).toEqual([]);
});

test('a shot started at the machine: the espresso screen opens by itself with a live graph, and home keeps the finished graph', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // The shot is started at the machine: the screen opens when a frame says espresso.
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('screen-espresso')).toBeVisible();
  const early = await points(page);
  expect(early).toBeGreaterThan(20);

  await gateway.replay(page, 0.3, 0.7);
  await expect.poll(() => points(page)).toBeGreaterThan(early);
  await expect(page.getByTestId('espresso-profile')).toHaveText('A-Flow / default-medium');
  expect(parseFloat((await page.getByTestId('shot-timer').textContent())!)).toBeGreaterThan(15);
  expect(parseFloat((await page.getByTestId('shot-weight').textContent())!)).toBeGreaterThan(5);
  await expect(page.getByTestId('shot-pressure')).toContainText('bar');
  for (const line of ['pressure', 'flow', 'weight-flow', 'temperature']) {
    expect((await page.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(100);
  }
  // The graph draws the weight flow in g/s, the screen keeps the weight in g (founder, 2026-10-14).
  await expect(page.getByTestId('shot-line-weight')).toHaveCount(0);
  await expect(page.getByTestId('shot-unit-weight-flow')).toHaveText('g/s');
  await expectInsideViewport(page);
  await page.screenshot({ path: 'docs/product/espresso.png' });

  // Stop is one tap; the skin sends no tare and no stop of its own for the target weight.
  await page.getByTestId('stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(0);

  await gateway.replay(page, 0.7, 1);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('last-shot')).toBeVisible();
  // Every espresso frame from the first one with water is a point; the mock repeated its latest
  // frame while the test looked.
  expect(await points(page)).toBeGreaterThanOrEqual(WATER_FRAMES);
  expect(await points(page)).toBeLessThan(WATER_FRAMES + 20);
  const seconds = parseFloat((await page.getByTestId('last-shot-time').textContent())!);
  expect(seconds).toBeGreaterThan(25);
  expect(seconds).toBeLessThan(31);
  const grams = parseFloat((await page.getByTestId('last-shot-weight').textContent())!);
  expect(grams).toBeGreaterThan(32);
  expect(grams).toBeLessThan(36);
  await expectInsideViewport(page);
  await page.screenshot({ path: 'docs/product/home.png' });

  await page.getByTestId('dismiss-shot').click();
  await expect(page.getByTestId('last-shot')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the espresso screen opens when the skin loads in the middle of a shot', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.addInitScript(() => localStorage.setItem('decaid-skin.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('screen-editor')).toBeVisible();

  await gateway.replay(page, 0.4, 0.6);
  await expect(page.getByTestId('screen-espresso')).toBeVisible();
  await expect(page.getByTestId('stop')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('the picker lists the profiles of the gateway, offers the A-Flow 3.0 defaults and loads one', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();

  const items = page.getByTestId('profile-item');
  await expect(items).toHaveCount(5);
  // A-Flow first, the rest by title; the loaded one is marked and selected.
  await expect(items.first()).toContainText('A-Flow / default-light');
  await expect(items.nth(1)).toContainText('loaded');
  await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(items.last()).toContainText('D-Flow / default');

  await expect(page.getByTestId('offer-defaults')).toContainText('floral, light, medium, dark, 46mm');
  await page.getByTestId('add-defaults').click();
  await expect(page.getByTestId('offer-defaults')).toHaveCount(0);
  const posts = gateway.calls('POST', '/api/v1/profiles');
  expect(posts.map((post) => post.body.profile.title)).toEqual([
    'A-Flow / default-floral',
    'A-Flow / default-light',
    'A-Flow / default-medium',
    'A-Flow / default-dark',
    'A-Flow / default-46mm',
  ]);
  // The values go into the metadata, none into the notes (spec 3.6).
  expect(posts[0].body.metadata).toEqual({ source: 'decaid-skin', ...paramsMetadata(DEFAULT_PROFILES[0].params) });
  expect(posts[0].body.profile.notes).toBe('');
  await expect(items).toHaveCount(10);
  await expect(items.first()).toContainText('A-Flow / default-floral');
  await expect(items.first()).toContainText('A-Flow 3.0');

  await expectInsideViewport(page);
  // No 'load' button: a tap on a profile loads it (founder, 2026-10-13).
  await expect(page.getByTestId('load-profile')).toHaveCount(0);
  await items.filter({ hasText: 'A-Flow / default-dark' }).click();
  // Loading is one PUT of the workflow: the profile, its stop weight and its dose.
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  // The workflow's copy carries the values in its notes: the workflow has no metadata.
  expect(puts[0].body.profile).toEqual(workflowProfile(posts[3].body.profile, DEFAULT_PROFILES[3].params));
  expect(puts[0].body.context).toEqual({ targetYield: 36, targetDoseWeight: 16 });
  expect(gateway.calls('POST', '/api/v1/machine/profile')).toHaveLength(0);
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-dark');
  // Dose and stop weight are not on home: the gateway's workflow holds them.
  expect(gateway.workflow.context).toMatchObject({ targetYield: 36, targetDoseWeight: 16 });

  // The gateway has the defaults now: no offer the next time.
  await page.getByTestId('open-profiles').click();
  await expect(items).toHaveCount(10);
  await expect(page.getByTestId('offer-defaults')).toHaveCount(0);
  const dark = items.filter({ hasText: 'loaded' });
  await expect(dark).toContainText('A-Flow / default-dark');
  // The loaded one is selected, with its stop weight and its dose.
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-detail')).toContainText('36 g');
  await expect(page.getByTestId('profile-detail')).toContainText('16 g');
  expect(errors).toEqual([]);
});

test('every screen is one tap from home and back, and the screen survives a reload', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await page.goto('/');

  for (const [button, screen, title] of [
    ['open-settings', 'settings', 'Settings'],
  ]) {
    await openMenu(page);
    await page.getByTestId(button).click();
    await expect(page.getByTestId(`screen-${screen}`).locator('h1')).toHaveText(title);
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('screen-home')).toBeVisible();
  }

  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('graph')).toBeVisible();
  // localStorage, not sessionStorage: the WebView unloads in the background (spec 4.1).
  expect(await page.evaluate(() => [localStorage.getItem('decaid-skin.screen'), sessionStorage.length])).toEqual([
    'editor',
    0,
  ]);
  await page.reload();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('graph')).toBeVisible();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  expect(errors).toEqual([]);
});
