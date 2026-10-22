import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Tare by a tap on the weight (3.7, acceptance items 6 and 21), settings and sleep / wake
// against a mocked gateway (D8c), and the stream the gateway closed with an error. The same
// against the running gateway: e2e-rig/scale-sleep.spec.ts.

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
    // In the settings page's panels, which scroll (research.md 20.7), only the width counts.
    const scrolled = (element: Element) =>
      !!element.parentElement?.closest('[data-testid="settings-content"], [aria-label="settings categories"]');
    const outside = [...document.querySelectorAll('button, section, header, h1')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        (rect.left < 0 || rect.right > innerWidth + 0.5 || (!scrolled(element) && (rect.top < 0 || rect.bottom > innerHeight + 0.5)))
      );
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

test('scale: there is no scale page and no menu entry; a tap on the weight tares (item 21)', async ({ page }) => {
  const gateway = await mockGateway(page);
  // A skin that showed the scale page before opens home.
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'scale'));
  await page.goto('/');
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('screen-scale')).toHaveCount(0);
  await page.getByTestId('menu').click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Settings',
    /^Beans and grinders/,
    /^Clean/,
    /^Steam off/,
    /^Machine sleep/,
    /^Machine and app sleep/,
  ]);
  await expect(page.getByTestId('open-scale')).toHaveCount(0);
  await page.getByTestId('menu-backdrop').click();

  // The weight shows in the state line, and a tap on it tares.
  gateway.putOnScale(212.4);
  await expect(page.getByTestId('state-scale')).toHaveText('212.4 g');
  // The weight is a finger's target, larger than its text, and a tap in its margin tares too.
  const target = (await page.getByTestId('tare').boundingBox())!;
  expect(target.height).toBeGreaterThanOrEqual(44);
  await page.mouse.click(target.x + target.width / 2, target.y + 4);
  await expect(page.getByTestId('state-scale')).toHaveText('0.0 g');
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(1);
  gateway.putOnScale(212.4);
  await expect(page.getByTestId('state-scale')).toHaveText('212.4 g');
  await page.getByTestId('state-scale').click();
  await expect(page.getByTestId('state-scale')).toHaveText('0.0 g');
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(2);
  await expect(page.getByTestId('tare-notice')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  // The scale goes away: the warning looks for it (spec 3.9), and a tap on it tares nothing.
  gateway.connectScale(false);
  await expect(page.getByTestId('state-scale')).toHaveText('⚠ looking for it');
  await expect(page.getByTestId('tare')).toHaveCount(0);
  await page.getByTestId('state-scale').click();
  await page.waitForTimeout(300);
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(2);
  await expect(page.getByTestId('notice')).toHaveCount(0);

  gateway.connectScale(true);
  await expect(page.getByTestId('tare')).toBeVisible();
  expect(errors).toEqual([]);
});

test('scale: the status frame alone makes the weight a tare button, before any weight', async ({ page }) => {
  const gateway = await mockGateway(page);
  // A scale stream that sends its first frame and nothing else.
  await page.routeWebSocket(/:8080\/ws\/v1\/scale\/snapshot/, (ws) => ws.send(JSON.stringify({ status: 'connected' })));
  await page.goto('/');
  await expect(page.getByTestId('state-scale')).toHaveText('–');
  await expect(page.getByTestId('tare')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('scale: a tare Decaid blocks during a shot is a notice, another failure is an error', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  // A shot runs; home's state line with the scale stays visible above it (spec 3.11).
  await gateway.replay(page, 0, 0.4);
  await expect(page.getByTestId('shot-plot')).toBeVisible();

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
  const gateway = (await mockGateway(page)).withDefaults('light');
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();

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
    'adjust-1',
    'adjust-2',
    'adjust-3',
  ];
  // The founder's defaults of 2026-10-12, and the adjust buttons of 2026-10-16 (spec 3.7).
  expect(await values(STEAM)).toEqual(['150g', '225g', '275g', '26s', '180g', '150g', '25s', '50s', '30s', '-8s', '-4s', '5s']);
  const workaround = page.getByTestId('setting-first-step-workaround');
  const steps = page.getByTestId('setting-show-profile-steps');
  await expect(workaround).toHaveAttribute('aria-checked', 'false');
  await expect(steps).toHaveAttribute('aria-checked', 'true');
  // The category Skin of the ported page (research.md 20.6): its subcategories, nothing else.
  await expect(page.locator('[data-testid="screen-settings"] h2')).toHaveText([
    'Steam',
    'Hot water',
    'Profile',
    'Shot graph',
    'Display Size',
    'Active Skin',
    'Backup and version',
  ]);
  await expect(page.getByTestId('settings-start').locator('b')).toHaveText(['floral', 'light', 'medium', 'dark', '46mm']);
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  // The number pad of the editor, with the unit and the range.
  await page.getByTestId('setting-mug-small').click();
  await expect(page.getByTestId('numpad-range')).toHaveText('0 to 1000 g');
  await expect(page.getByTestId('numpad-display')).toHaveText('150');
  await page.getByTestId('numpad-cancel').click();
  await page.getByTestId('setting-reference-seconds').click();
  await expect(page.getByTestId('numpad-range')).toHaveText('1 to 255 s');
  await expect(page.getByTestId('numpad-key-dot')).toBeDisabled();
  await page.getByTestId('numpad-cancel').click();
  expect(await values(STEAM)).toEqual(['150g', '225g', '275g', '26s', '180g', '150g', '25s', '50s', '30s', '-8s', '-4s', '5s']);

  await type(page, 'setting-mug-small', '162.5');
  await type(page, 'setting-reference-seconds', '30');
  await type(page, 'setting-reference-milk', '100');
  await type(page, 'setting-favourite-2', '45');
  // The category Profile's numbers (founder, 2026-10-15): the maximum flow, 4 to 20 ml/s, and the default dose.
  expect(await values(['max-flow', 'default-dose'])).toEqual(['8ml/s', '18g']);
  await page.getByTestId('setting-max-flow').click();
  await expect(page.getByTestId('numpad-range')).toHaveText('4 to 20 ml/s');
  await page.getByTestId('numpad-cancel').click();
  await type(page, 'setting-max-flow', '12');
  await type(page, 'setting-default-dose', '17.5');
  expect(await values(['max-flow', 'default-dose'])).toEqual(['12ml/s', '17.5g']);
  await workaround.click();
  await steps.click();
  const changed = ['162.5g', '225g', '275g', '30s', '100g', '150g', '25s', '45s', '30s', '-8s', '-4s', '5s'];
  expect(await values(STEAM)).toEqual(changed);

  // One store in localStorage, nothing in sessionStorage (spec 4.1: the WebView unloads).
  expect(
    await page.evaluate(() => ({
      keys: Object.keys(localStorage).sort(),
      session: sessionStorage.length,
      settings: JSON.parse(localStorage.getItem('pureflow.settings')!) as unknown,
    })),
  ).toEqual({
    // The page's last category is not a setting (research.md 20.7).
    keys: ['pureflow.screen', 'pureflow.settings', 'pureflow.settings-location'],
    session: 0,
    settings: {
      showProfileSteps: false,
      firstStepWorkaround: true,
      showGraphLegend: true,
      showShotValues: true,
      displaySize: 1,
      lineWidth: 1,
      startProfiles: [
        'A-Flow / default-floral',
        'A-Flow / default-light',
        'A-Flow / default-medium',
        'A-Flow / default-dark',
        'A-Flow / default-46mm',
      ],
      maxFlow: 12,
      defaultDose: 17.5,
      steam: {
        mugSmall: 162.5,
        mugMedium: 225,
        mugLarge: 275,
        milkPerDrink: 150,
        referenceSeconds: 30,
        referenceMilk: 100,
        favourites: [25, 45, 30],
        adjustments: [-8, -4, 5],
        heaterTemperature: 150,
      },
      hotWater: { ratios: [2, 2.5, 3] },
    },
  });

  await page.reload();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  expect(await values(STEAM)).toEqual(changed);
  expect(await values(['max-flow', 'default-dose'])).toEqual(['12ml/s', '17.5g']);
  await expect(workaround).toHaveAttribute('aria-checked', 'true');
  await expect(steps).toHaveAttribute('aria-checked', 'false');

  // The steam page calculates with them: 362.5 g is the small mug with 200 g of milk, 60 s.
  await page.getByTestId('nav-home').click();
  await toPage(page, 'steam');
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
  await page.getByTestId('settings-category-skin').click();
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
  await page.getByTestId('settings-category-skin').click();
  await expect(steps).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('settings: stored data that cannot be read gives the defaults, and the page still saves', async ({ page }) => {
  await mockGateway(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('pureflow.settings', '{"steam":{"mugSmall":"heavy"');
    sessionStorage.setItem('seeded', '1');
  });
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('setting-mug-small').locator('b')).toHaveText('150g');
  await type(page, 'setting-mug-large', '300');
  await page.reload();
  await expect(page.getByTestId('setting-mug-large').locator('b')).toHaveText('300g');
  await expect(page.getByTestId('setting-mug-small').locator('b')).toHaveText('150g');
  expect(errors).toEqual([]);
});

test('machine and app sleep sends the state sleeping, the skin goes dark, a touch anywhere wakes', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  expect(gateway.calls('PUT', '/api/v1/display/brightness')).toHaveLength(0);

  await page.getByTestId('menu').click();

  await page.getByTestId('app-sleep').click();
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
  await expect(page.getByTestId('machine-sleep')).toBeEnabled();
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
  await expect(page.getByTestId('machine-sleep')).toBeEnabled();
  gateway.steamFor(3);
  await expect(page.getByTestId('status-title')).toHaveText('Steam');
  await expect(page.getByTestId('machine-sleep')).toBeDisabled();
  gateway.state = 'idle';
  await expect(page.getByTestId('machine-sleep')).toBeEnabled();
  gateway.machineConnected = false;
  await expect(page.getByTestId('status-title')).toHaveText('No machine connected', { timeout: 10_000 });
  await expect(page.getByTestId('machine-sleep')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('a workflow without a dose takes the default dose; one with a dose keeps it', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow = { ...gateway.workflow, context: { targetYield: 36 } };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect.poll(() => gateway.workflow.context.targetDoseWeight).toBe(18);
  expect(gateway.calls('PUT', '/api/v1/workflow').map((call) => call.body)).toContainEqual({ context: { targetDoseWeight: 18 } });

  // A dose the user set elsewhere stays, also after a change of the default.
  gateway.workflow = { ...gateway.workflow, context: { targetYield: 36, targetDoseWeight: 20 } };
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await type(page, 'setting-default-dose', '16');
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.waitForTimeout(500);
  expect(gateway.workflow.context.targetDoseWeight).toBe(20);
  expect(errors).toEqual([]);
});

test('a stream the gateway closed with an error is tried again for 30 s, then shown with a reconnect action', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.refuseStreams = true;
  await page.clock.install();
  await page.goto('/');

  // The skin tries again by itself for 30 s (founder, 2026-10-15): no reconnect button yet.
  await expect(page.getByTestId('status-title')).toHaveText('Decaid is not reachable');
  const failed = page.getByTestId('stream-failed');
  let seconds = 0;
  for (; seconds < 40 && !(await failed.isVisible()); seconds++) {
    if (seconds < 29) await expect(failed).toHaveCount(0);
    await page.clock.runFor(1000);
    await page.waitForTimeout(30);
  }
  expect(seconds).toBeGreaterThanOrEqual(30);
  expect(seconds).toBeLessThan(34);
  // Every stream was asked again, with the growing delay: not once a second.
  const machineAttempts = gateway.refused;
  expect(machineAttempts).toBeGreaterThan(8);
  expect(machineAttempts).toBeLessThan(40);
  await page.clock.resume();

  // Then the skin says what happened and offers the way on.
  await expect(page.getByTestId('stream-failed')).toContainText('Decaid closed the connection: the mock refuses this stream');
  await expect(page.getByTestId('status-title')).toHaveText('Decaid closed the connection');
  await expect(page.getByTestId('status')).toHaveAttribute('data-link', 'refused');
  await expect(page.getByTestId('stop')).toHaveCount(0);
  await expect(page.getByTestId('state-group')).toHaveCount(0);
  expect(await overflow(page)).toEqual({ scrolls: false, outside: 0 });

  // After the 30 s it does not try again by itself: it is still refused after a while.
  const attempts = gateway.refused;
  await page.clock.runFor(60_000);
  await expect(page.getByTestId('stream-failed')).toBeVisible();
  expect(gateway.refused).toBe(attempts);

  // Reconnect while the gateway still refuses: the skin tries again, then the same state again.
  await page.getByTestId('reconnect').click();
  await expect(page.getByTestId('stream-failed')).toHaveCount(0);
  await expect.poll(() => gateway.refused).toBeGreaterThan(attempts);
  for (let i = 0; i < 40 && !(await failed.isVisible()); i++) {
    await page.clock.runFor(1000);
    await page.waitForTimeout(30);
  }
  await expect(page.getByTestId('stream-failed')).toBeVisible();
  await expect(page.getByTestId('status')).toHaveAttribute('data-link', 'refused');

  // The action is on every screen.
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await expect(page.getByTestId('stream-failed')).toBeVisible();
  gateway.refuseStreams = false;
  await page.getByTestId('reconnect').click();
  await expect(page.getByTestId('stream-failed')).toHaveCount(0);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('state-scale')).toHaveText('0.0 g');
  expect(errors).toEqual([]);
});
