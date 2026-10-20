import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PROFILES } from '../src/aflow';
import { paramsMetadata, workflowProfile } from '../src/editor/storage';
import { defaultProfile } from '../src/shell/profiles';
import { WATER_FRAMES, mockGateway, record } from './mock-gateway';

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
    // In the settings page's panels, which scroll (research.md 20.7), only the width counts.
    const scrolled = (element: Element) =>
      !!element.parentElement?.closest('[data-testid="settings-content"], [aria-label="settings categories"]');
    const outside = [...document.querySelectorAll('button, h1, section, aside, svg')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        (rect.left < 0 || rect.right > innerWidth + 0.5 || (!scrolled(element) && (rect.top < 0 || rect.bottom > innerHeight + 0.5)))
      );
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

test('home shows the state line the machine sent, the profile, and no start: the DE1 is started at the machine', async ({ page }) => {
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
  await expect(page.getByTestId('state-scale')).toHaveText(/^⚠ (looking for it|not connected, tap to retry)$/);
  gateway.connectScale(true);
  gateway.putOnScale(12.3);
  await expect(page.getByTestId('state-scale')).toHaveText('12.3 g');
  expect(errors).toEqual([]);
});

test('the menu opens with settings, steam off and machine sleep, and closes on a choice and on a tap outside', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('menu-list')).toHaveCount(0);

  // A tap outside closes it and does nothing else.
  await openMenu(page);
  await expect(page.getByRole('menuitem')).toHaveText(['Settings', /^Steam off/, /^Machine sleep/]);
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
  await page.getByTestId('machine-sleep').click();
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

  // The steam tab is the mirror of the history's: down the right edge. Since R5 (spec 3.7) the
  // hot water tab takes the bottom of it: together they are as long as the history's.
  const tab = (await page.getByTestId('open-steam').boundingBox())!;
  const water = (await page.getByTestId('open-hot-water').boundingBox())!;
  const history = (await page.getByTestId('nav-history').boundingBox())!;
  expect(tab.x + tab.width).toBeGreaterThan(1280 - 2);
  expect(tab.height).toBeGreaterThan(history.height / 2);
  expect(Math.abs(water.y + water.height - (history.y + history.height))).toBeLessThan(20);
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
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as { name: string; version: string };
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

test('a shot started at the machine: the shot overlay opens by itself with a live graph, stays, and home keeps the finished graph', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // The shot is started at the machine: the overlay opens on home when a frame says espresso.
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  await expect(page.getByTestId('screen-home')).toBeVisible();
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
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  // The overlay stays after the shot (spec 3.8); a tap closes it to home's last shot.
  await expect(page.getByTestId('shot-phases')).toBeVisible();
  await page.getByTestId('shot-close').click();
  await expect(page.getByTestId('shot-overlay')).toHaveCount(0);
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

test('the shot overlay opens on home when the skin loads in the middle of a shot', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('screen-editor')).toBeVisible();

  await gateway.replay(page, 0.4, 0.6);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  await expect(page.getByTestId('stop')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('the picker lists the A-Flow 3.0 defaults of the skin first, offers no add and loads one without storing it', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();

  // The skin's five defaults first, marked; the copies under their titles that Decaid stores
  // (here the plugin's light and medium as Decaid bundles them) are not listed (spec 3.8, T5).
  const items = page.getByTestId('profile-item');
  await expect(items.locator('.title')).toHaveText([
    'A-Flow / default-floral',
    'A-Flow / default-light',
    'A-Flow / default-medium',
    'A-Flow / default-dark',
    'A-Flow / default-46mm',
    'Adaptive v2',
    'Best practice',
    'D-Flow / default',
  ]);
  await expect(page.getByTestId('default-tag')).toHaveCount(5);
  await expect(items.first()).toHaveAttribute('data-default', 'true');
  await expect(items.last()).toHaveAttribute('data-default', 'false');
  // No 'not in Decaid' offer: the defaults are not stored in Decaid.
  await expect(page.getByText('not in Decaid')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^add/ })).toHaveCount(0);

  await expectInsideViewport(page);
  // A tap selects, 'load' loads (founder, 2026-10-17).
  await items.filter({ hasText: 'A-Flow / default-dark' }).click();
  await expect(page.getByTestId('profile-detail')).toContainText('A-Flow / default-dark');
  await expect(page.getByTestId('profile-detail')).toContainText('16 g');
  await expect(page.getByTestId('profile-preview')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  await page.getByTestId('load-profile').click();
  // Loading is one PUT of the workflow: the default as the skin holds it, its stop weight and
  // its dose; nothing is stored.
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  // The workflow's copy carries the values in its notes: the workflow has no metadata.
  expect(puts[0].body.profile).toEqual(workflowProfile(defaultProfile(DEFAULT_PROFILES[3]), DEFAULT_PROFILES[3].params));
  expect(puts[0].body.context).toEqual({ targetYield: 36, targetDoseWeight: 16 });
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  expect(gateway.calls('POST', '/api/v1/machine/profile')).toHaveLength(0);
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-dark');
  // Dose and stop weight are not on home: the gateway's workflow holds them.
  expect(gateway.workflow.context).toMatchObject({ targetYield: 36, targetDoseWeight: 16 });

  // The next time the loaded default is marked and selected, with its stop weight and its dose.
  await page.getByTestId('open-profiles').click();
  await expect(items).toHaveCount(8);
  const dark = items.filter({ hasText: 'loaded' });
  await expect(dark).toHaveCount(1);
  await expect(dark).toContainText('A-Flow / default-dark');
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-detail')).toContainText('36 g');
  await expect(page.getByTestId('profile-detail')).toContainText('16 g');
  expect(gateway.calls('POST', '/api/v1/profiles')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('the picker lists a stored profile with a default’s steps under its own title only', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults();
  // The founder's test-light: the steps of the light default under another title (spec 3.8).
  const light = DEFAULT_PROFILES[1];
  gateway.profiles.push(
    record(
      'profile:test-light',
      { ...defaultProfile(light), title: 'A-Flow / test-light' },
      {
        source: 'pureflow',
        ...paramsMetadata(light.params),
      },
    ),
  );
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const items = page.getByTestId('profile-item');
  await expect(items.filter({ hasText: 'A-Flow / test-light' })).toHaveCount(1);
  // The copies of the defaults that withDefaults stores are not listed: each title once.
  for (const entry of DEFAULT_PROFILES) {
    await expect(items.filter({ hasText: entry.title })).toHaveCount(1);
    await expect(items.filter({ hasText: entry.title })).toHaveAttribute('data-default', 'true');
  }
  await expect(items.filter({ hasText: 'A-Flow / test-light' })).toHaveAttribute('data-default', 'false');
  expect(errors).toEqual([]);
});

test('the picker filters by title, a tap selects and shows the description and preview, load loads', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.withDefaults();
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const items = page.getByTestId('profile-item');
  await expect(items).toHaveCount(8);

  // The filter: a part of the title, in any case (founder, 2026-10-17).
  const filter = page.getByTestId('profile-filter');
  // The skin's default only: the copy withDefaults stored and the plugin's bundled one are not listed.
  await filter.fill('LIGHT');
  await expect(items.locator('.title')).toHaveText(['A-Flow / default-light']);
  await filter.fill('ive v');
  await expect(items.locator('.title')).toHaveText(['Adaptive v2']);
  await filter.fill('turbo');
  await expect(items).toHaveCount(0);
  await expect(page.getByTestId('profiles-empty')).toContainText('turbo');
  await filter.fill('');
  await expect(items).toHaveCount(8);

  // A tap selects: the description and the preview show, and nothing is loaded.
  const detail = page.getByTestId('profile-detail');
  await items.filter({ hasText: 'Adaptive v2' }).click();
  await expect(items.filter({ hasText: 'Adaptive v2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await expect(detail.locator('h1')).toHaveText('Adaptive v2');
  await expect(page.getByTestId('profile-description')).toHaveText('Adaptive v2: a profile of the mocked gateway');
  // The step editor's curve preview: five steps, without labels.
  const preview = page.getByTestId('profile-preview');
  await expect(preview.getByTestId('shot-graph')).toBeVisible();
  await expect(preview.getByTestId('shot-border')).toHaveCount(4);
  await expect(preview.getByTestId('shot-target-pressure')).toHaveCount(1);
  await expect(preview.locator('text')).toHaveCount(0);
  await expect(preview.getByTestId('preview-untimed')).toHaveCount(0);

  // An A-Flow default: no line of its values in the description, the same preview of its targets.
  await items.filter({ hasText: 'A-Flow / default-medium' }).filter({ hasText: 'A-Flow 3.0' }).click();
  await expect(detail.locator('h1')).toHaveText('A-Flow / default-medium');
  await expect(detail).not.toContainText('aflow');
  await expect(preview.getByTestId('shot-graph')).toBeVisible();
  await expect(detail).toContainText('16 g');
  await page.screenshot({ path: 'docs/product/profile-picker.png' });
  await expectInsideViewport(page);
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);

  // A selected profile the filter hides is neither shown nor loadable until it shows again.
  await filter.fill('best');
  await expect(page.getByTestId('load-profile')).toHaveCount(0);
  await items.filter({ hasText: 'Best practice' }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  expect(puts[0].body.profile.title).toBe('Best practice');
  await expect(page.getByTestId('profile-name')).toHaveText('Best practice');

  // The picker opens again with the whole list, the loaded one selected.
  await page.getByTestId('open-profiles').click();
  await expect(filter).toHaveValue('');
  await expect(items).toHaveCount(8);
  await expect(items.filter({ hasText: 'loaded' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('every screen is one tap from home and back, and the screen survives a reload', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await page.goto('/');

  for (const [button, screen, title] of [['open-settings', 'settings', 'Settings']]) {
    await openMenu(page);
    await page.getByTestId(button).click();
    await expect(page.getByTestId(`screen-${screen}`).locator('h1')).toHaveText(title);
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('screen-home')).toBeVisible();
  }

  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('graph')).toBeVisible();
  // localStorage, not sessionStorage: the WebView unloads in the background (spec 4.1).
  expect(await page.evaluate(() => [localStorage.getItem('pureflow.screen'), sessionStorage.length])).toEqual(['editor', 0]);
  await page.reload();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('graph')).toBeVisible();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  expect(errors).toEqual([]);
});
