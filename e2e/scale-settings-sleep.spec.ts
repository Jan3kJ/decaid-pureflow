import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// Scale, settings and sleep / wake against a mocked gateway (D8c, acceptance item 6), and the
// stream the gateway closed with an error. The same against the running gateway:
// e2e-rig/scale-sleep.spec.ts.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    // The browser logs a 400 by itself; the blocked tare is one, and it is wanted.
    if (message.type() === 'error' && !message.text().includes('400 (Bad Request)')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** Nothing scrolls and nothing a finger needs is outside the viewport. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const outside = [...document.querySelectorAll('button, section, header, h1')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5);
    });
    return { scrolls: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight, outside: outside.length };
  });
}

/** Types a value on the number pad that a tap on `testid` opens. */
async function type(page: Page, testid: string, value: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

test('scale: the connect state from the stream, and tare', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-scale').click();

  await expect(page.getByTestId('scale-state')).toHaveAttribute('data-scale', 'connected');
  await expect(page.getByTestId('scale-link')).toHaveText('Connected');
  gateway.putOnScale(212.4);
  await expect(page.getByTestId('scale-page-weight')).toHaveText('212.4g');

  await page.getByTestId('tare').click();
  await expect(page.getByTestId('scale-page-weight')).toHaveText('0.0g');
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(1);
  await expect(page.getByTestId('tare-notice')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // The scale goes away: a status frame on the open socket, no weight, nothing to tare.
  gateway.connectScale(false);
  await expect(page.getByTestId('scale-state')).toHaveAttribute('data-scale', 'disconnected');
  await expect(page.getByTestId('scale-link')).toHaveText('Not connected');
  await expect(page.getByTestId('scale-page-weight')).toHaveText('–');
  await expect(page.getByTestId('tare')).toBeDisabled();
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  gateway.connectScale(true);
  await expect(page.getByTestId('scale-link')).toHaveText('Connected');
  await expect(page.getByTestId('tare')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('scale: the status frame alone says connected, before any weight', async ({ page }) => {
  const gateway = await mockGateway(page);
  // A scale stream that sends its first frame and nothing else.
  await page.routeWebSocket(/:8080\/ws\/v1\/scale\/snapshot/, (ws) => ws.send(JSON.stringify({ status: 'connected' })));
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-scale').click();
  await expect(page.getByTestId('scale-link')).toHaveText('Connected');
  await expect(page.getByTestId('scale-page-weight')).toHaveText('–');
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('scale: a tare Decaid blocks during a shot is a notice, another failure is an error', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  // A shot runs; the user leaves the espresso screen for the scale.
  await gateway.replay(page, 0, 0.4);
  await expect(page.getByTestId('screen-espresso')).toBeVisible();
  await page.getByTestId('nav-home').click();
  await page.getByTestId('menu').click();
  await page.getByTestId('open-scale').click();

  gateway.tareBlocked = true;
  await page.getByTestId('tare').click();
  await expect(page.getByTestId('tare-notice')).toContainText('No tare while a shot runs');
  // Not an error: the warning's place stays empty.
  await expect(page.getByTestId('notice')).toHaveCount(0);
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(1);
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  // The notice goes with the next tare that works.
  gateway.tareBlocked = false;
  await page.getByTestId('tare').click();
  await expect(page.getByTestId('tare-notice')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  expect(errors).toEqual([]);

  // Any other answer is an error and reads as one.
  await page.route('http://localhost:8080/api/v1/scale/tare', (route) =>
    route.fulfill({
      status: 500,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ error: 'scale not connected' }),
    }),
  );
  await page.getByTestId('tare').click();
  await expect(page.getByTestId('notice')).toContainText('The scale was not tared');
  await expect(page.getByTestId('tare-notice')).toHaveCount(0);
});

test('settings: the defaults, typed values and both switches survive a reload', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();

  const values = (ids: string[]) => Promise.all(ids.map((id) => page.getByTestId(`setting-${id}`).locator('b').textContent()));
  const STEAM = [
    'mug-small',
    'mug-medium',
    'mug-large',
    'reference-seconds',
    'reference-milk',
    'milk-per-drink',
    'favourite-1',
    'favourite-2',
    'favourite-3',
  ];
  // The founder's defaults of 2026-10-12.
  expect(await values(STEAM)).toEqual(['150g', '225g', '275g', '26s', '180g', '150g', '25s', '50s', '30s']);
  const workaround = page.getByTestId('setting-first-step-workaround');
  const steps = page.getByTestId('setting-show-profile-steps');
  await expect(workaround).toHaveAttribute('aria-checked', 'false');
  await expect(steps).toHaveAttribute('aria-checked', 'true');
  // Three categories and nothing else.
  await expect(page.locator('[data-testid="screen-settings"] h2')).toHaveText(['Steam', 'Profile', 'Shot graph']);
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });
  await page.screenshot({ path: 'docs/product/settings.png' });

  // The number pad of the editor, with the unit and the range.
  await page.getByTestId('setting-mug-small').click();
  await expect(page.getByTestId('numpad-range')).toHaveText('0 to 1000 g');
  await expect(page.getByTestId('numpad-display')).toHaveText('150');
  await page.getByTestId('numpad-cancel').click();
  await page.getByTestId('setting-reference-seconds').click();
  await expect(page.getByTestId('numpad-range')).toHaveText('1 to 255 s');
  await expect(page.getByTestId('numpad-key-dot')).toBeDisabled();
  await page.getByTestId('numpad-cancel').click();
  expect(await values(STEAM)).toEqual(['150g', '225g', '275g', '26s', '180g', '150g', '25s', '50s', '30s']);

  await type(page, 'setting-mug-small', '162.5');
  await type(page, 'setting-reference-seconds', '30');
  await type(page, 'setting-reference-milk', '100');
  await type(page, 'setting-favourite-2', '45');
  await workaround.click();
  await steps.click();
  const changed = ['162.5g', '225g', '275g', '30s', '100g', '150g', '25s', '45s', '30s'];
  expect(await values(STEAM)).toEqual(changed);

  // One store in localStorage, nothing in sessionStorage (spec 4.1: the WebView unloads).
  expect(
    await page.evaluate(() => ({
      keys: Object.keys(localStorage).sort(),
      session: sessionStorage.length,
      settings: JSON.parse(localStorage.getItem('decaid-skin.settings')!),
    })),
  ).toEqual({
    keys: ['decaid-skin.screen', 'decaid-skin.settings'],
    session: 0,
    settings: {
      showProfileSteps: false,
      firstStepWorkaround: true,
      showGraphLegend: true,
      steam: {
        mugSmall: 162.5,
        mugMedium: 225,
        mugLarge: 275,
        milkPerDrink: 150,
        referenceSeconds: 30,
        referenceMilk: 100,
        favourites: [25, 45, 30],
      },
    },
  });

  await page.reload();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  expect(await values(STEAM)).toEqual(changed);
  await expect(workaround).toHaveAttribute('aria-checked', 'true');
  await expect(steps).toHaveAttribute('aria-checked', 'false');

  // The steam page calculates with them: 362.5 g is the small mug with 200 g of milk, 60 s.
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-steam').click();
  await expect(page.getByTestId('steam-favourite')).toHaveText(['25 s', '45 s', '30 s']);
  gateway.putOnScale(362.5);
  await expect(page.getByTestId('steam-mug-weight')).toHaveText('162.5 g');
  await expect(page.getByTestId('steam-milk')).toHaveText('200 g');
  await expect(page.getByTestId('steam-seconds')).toHaveText('60 s');

  // The editor follows both switches: no steps button while the setting is off (founder,
  // 2026-10-13), and a Pre Fill step in the panel once it is on again.
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('toggle-steps')).toHaveCount(0);
  await expect(page.getByTestId('steps')).toHaveCount(0);
  await page.getByTestId('nav-home').click();
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await steps.click();
  await expect(steps).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('toggle-steps')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('toggle-steps').click();
  await expect(page.getByTestId('steps')).toContainText('Pre Fill');
  // The editor's button opens the panel; the setting stays the settings page's.
  await page.getByTestId('toggle-steps').click();
  await page.getByTestId('nav-home').click();
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(steps).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('settings: stored data that cannot be read gives the defaults, and the page still saves', async ({ page }) => {
  await mockGateway(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('decaid-skin.settings', '{"steam":{"mugSmall":"heavy"');
    sessionStorage.setItem('seeded', '1');
  });
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('setting-mug-small').locator('b')).toHaveText('150g');
  await type(page, 'setting-mug-large', '300');
  await page.reload();
  await expect(page.getByTestId('setting-mug-large').locator('b')).toHaveText('300g');
  await expect(page.getByTestId('setting-mug-small').locator('b')).toHaveText('150g');
  expect(errors).toEqual([]);
});

test('sleep: the button sends the state sleeping, the skin goes dark, a touch anywhere wakes', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  expect(gateway.calls('PUT', '/api/v1/display/brightness')).toHaveLength(0);

  await page.getByTestId('menu').click();

  await page.getByTestId('sleep').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/sleeping').length).toBe(1);
  // The skin shows sleep when the machine says so, not when the button was tapped.
  await expect(page.getByTestId('asleep')).toBeVisible();
  await expect(page.getByTestId('asleep')).toContainText('touch to wake');
  // This platform can set the brightness: the screen is dimmed.
  await expect.poll(() => gateway.calls('PUT', '/api/v1/display/brightness').map((call) => call.body)).toEqual([{ brightness: 5 }]);
  expect(gateway.calls('PUT', '/api/v1/machine/state/idle')).toHaveLength(0);

  // A touch anywhere: a corner, far from every button of home.
  await page.touchscreen.tap(1200, 760);
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect
    .poll(() => gateway.calls('PUT', '/api/v1/display/brightness').map((call) => call.body))
    .toEqual([{ brightness: 5 }, { brightness: 100 }]);
  expect(errors).toEqual([]);
});

test('sleep: the brightness is left alone where the platform does not support it', async ({ page }) => {
  const gateway = await mockGateway(page, { brightness: false });
  // The machine sleeps already when the skin loads.
  gateway.state = 'sleeping';
  await page.goto('/');
  await expect(page.getByTestId('asleep')).toBeVisible();
  await expect.poll(() => gateway.calls('GET', '/api/v1/display').length).toBe(1);

  await page.getByTestId('asleep').tap();
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('sleep')).toBeEnabled();
  await expect.poll(() => gateway.calls('GET', '/api/v1/display').length).toBe(2);
  expect(gateway.calls('PUT', '/api/v1/display/brightness')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('sleep is not offered while something runs or without a machine', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  // The menu stays open while the machine changes: its sleep entry follows.
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('sleep')).toBeEnabled();
  gateway.steamFor(3);
  await expect(page.getByTestId('status-title')).toHaveText('Steam');
  await expect(page.getByTestId('sleep')).toBeDisabled();
  gateway.state = 'idle';
  await expect(page.getByTestId('sleep')).toBeEnabled();
  gateway.machineConnected = false;
  await expect(page.getByTestId('status-title')).toHaveText('No machine connected', { timeout: 10_000 });
  await expect(page.getByTestId('sleep')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('a stream the gateway closed with an error is shown with a reconnect action', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.refuseStreams = true;
  await page.goto('/');

  // Not a dead screen and not 'trying again': the skin says what happened and offers the way on.
  await expect(page.getByTestId('stream-failed')).toContainText('Decaid closed the connection: the mock refuses this stream');
  await expect(page.getByTestId('status-title')).toHaveText('Decaid closed the connection');
  await expect(page.getByTestId('status')).toHaveAttribute('data-link', 'refused');
  await expect(page.getByTestId('stop')).toHaveCount(0);
  await expect(page.getByTestId('state-group')).toHaveCount(0);
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  // The stream does not reconnect by itself (doc/Skins.md): it is still refused after a while.
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('stream-failed')).toBeVisible();

  // Reconnect while the gateway still refuses: the same state again.
  await page.getByTestId('reconnect').click();
  await expect(page.getByTestId('stream-failed')).toBeVisible();
  await expect(page.getByTestId('status')).toHaveAttribute('data-link', 'refused');

  // The action is on every screen.
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('stream-failed')).toBeVisible();
  gateway.refuseStreams = false;
  await page.getByTestId('reconnect').click();
  await expect(page.getByTestId('stream-failed')).toHaveCount(0);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('state-scale')).toHaveText('0.0 g');
  expect(errors).toEqual([]);
});
