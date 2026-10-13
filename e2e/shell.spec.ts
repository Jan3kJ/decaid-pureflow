import { expect, test, type Page } from '@playwright/test';
import { ESPRESSO_FRAMES, mockGateway } from './mock-gateway';

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

const points = async (page: Page) => Number(await page.getByTestId('shot-graph').getAttribute('data-points'));

test('home shows the state the machine sent, the profile, dose and target weight', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');

  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('status-detail')).toHaveText('group 92.6 °C, set to 93 °C');
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-medium');
  await expect(page.getByTestId('dose')).toHaveText('18 g');
  await expect(page.getByTestId('target-weight')).toHaveText('36 g');
  await expect(page.getByTestId('scale-weight')).toHaveText('0.0 g');
  await expect(page.getByTestId('start')).toBeEnabled();
  // No finished shot, nothing to dismiss.
  await expect(page.getByTestId('last-shot')).toHaveCount(0);
  await expectInsideViewport(page);
  expect(errors).toEqual([]);
});

test('home follows the machine: asleep offers no start, a running state offers stop', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.state = 'sleeping';
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Asleep');
  await expect(page.getByTestId('start')).toBeDisabled();

  gateway.state = 'steam';
  await expect(page.getByTestId('status-title')).toHaveText('Steam');
  await page.getByTestId('stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  expect(errors).toEqual([]);
});

test('home says when Decaid is not reachable', async ({ page }) => {
  await mockGateway(page, { gateway: false });
  await page.goto('/');

  await expect(page.getByTestId('status-title')).toHaveText('Decaid is not reachable');
  await expect(page.getByTestId('status-detail')).toContainText('http://localhost:8080');
  await expect(page.getByTestId('start')).toBeDisabled();
  await expect(page.getByTestId('profile-name')).toHaveText('–');
  await expect(page.getByTestId('scale-weight')).toHaveText('none');
});

test('home says when no machine is connected, and shows the machine when it comes', async ({ page }) => {
  const gateway = await mockGateway(page, { machine: false });
  await page.goto('/');

  // The gateway answers and its stream is silent.
  await expect(page.getByTestId('status-title')).toHaveText('No machine connected', { timeout: 8000 });
  await expect(page.getByTestId('start')).toBeDisabled();
  // The workflow is the gateway's, with or without a machine.
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-medium');

  gateway.machineConnected = true;
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('start')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a shot: start, the espresso screen opens by itself with a live graph, and home keeps the finished graph', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  await page.getByTestId('start').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/espresso').length).toBe(1);
  // The screen waits for the machine: nothing opens before a frame says espresso.
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
  for (const line of ['pressure', 'flow', 'weight', 'temperature']) {
    expect((await page.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(100);
  }
  // A horizontal line has no height, so it counts as hidden: it is there.
  await expect(page.getByTestId('shot-target-weight')).toHaveCount(1);
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
  // Every espresso frame is a point; the mock repeated its latest frame while the test looked.
  expect(await points(page)).toBeGreaterThanOrEqual(ESPRESSO_FRAMES);
  expect(await points(page)).toBeLessThan(ESPRESSO_FRAMES + 20);
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
  expect(posts[0].body.metadata).toEqual({ source: 'decaid-skin', aflow: '3.0' });
  await expect(items).toHaveCount(10);
  await expect(items.first()).toContainText('A-Flow / default-floral');
  await expect(items.first()).toContainText('A-Flow 3.0');

  const dark = items.filter({ hasText: 'A-Flow / default-dark' });
  await dark.click();
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-detail')).toContainText('36 g');
  await expect(page.getByTestId('profile-detail')).toContainText('16 g');
  await expectInsideViewport(page);

  await page.getByTestId('load-profile').click();
  // Loading is one PUT of the workflow: the profile, its stop weight and its dose.
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  expect(puts[0].body.profile).toEqual(posts[3].body.profile);
  expect(puts[0].body.context).toEqual({ targetYield: 36, targetDoseWeight: 16 });
  expect(gateway.calls('POST', '/api/v1/machine/profile')).toHaveLength(0);
  await expect(page.getByTestId('profile-name')).toHaveText('A-Flow / default-dark');
  await expect(page.getByTestId('dose')).toHaveText('16 g');
  await expect(page.getByTestId('target-weight')).toHaveText('36 g');

  // The gateway has the defaults now: no offer the next time.
  await page.getByTestId('open-profiles').click();
  await expect(items).toHaveCount(10);
  await expect(page.getByTestId('offer-defaults')).toHaveCount(0);
  await expect(items.filter({ hasText: 'loaded' })).toContainText('A-Flow / default-dark');
  expect(errors).toEqual([]);
});

test('every screen is one tap from home and back, and the screen survives a reload', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');

  for (const [button, title] of [
    ['open-steam', 'Steam'],
    ['nav-history', 'Shot history'],
    ['open-scale', 'Scale'],
    ['open-settings', 'Settings'],
  ]) {
    await page.getByTestId(button).click();
    await expect(page.getByTestId('placeholder').locator('h1')).toHaveText(title);
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
