import { expect, test, type Page } from '@playwright/test';
import type { Settings } from '../src/settings';
import type { Backup } from '../src/settings-backup';
import { mockGateway, type MockGateway } from './mock-gateway';

// Skin > Display Size and Skin > Active Skin (spec 3.9 item 15, U11, acceptance 53), against the
// mocked gateway: each display option applies at once and stays over a reload; the skin switch
// lists Decaid's skins, asks, makes the chosen one Decaid's default, starts the skin server again
// and opens the port it serves on. The switch against the running gateway:
// e2e-rig/settings-skin.spec.ts.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('500 (Internal Server Error)')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Home, not the screen the skin opens on again after a reload. */
async function home(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'home'));
  await page.goto('/');
}

async function openSkin(page: Page, sub: string) {
  await home(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await page.getByTestId(`settings-sub-${sub}`).click();
}

const rootSize = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pureflow.settings') ?? '{}') as Settings);

test('the display size scales the whole skin at once, is saved, backed up and stays over a reload', async ({ page }) => {
  await openSkin(page, 'skin-display');
  // 16 px on 1280 x 800 at Medium (app.css).
  expect(await rootSize(page)).toBeCloseTo(16, 1);
  await expect(page.getByTestId('setting-display-size-1')).toHaveAttribute('aria-pressed', 'true');

  for (const [value, size] of [
    ['0.85', 13.6],
    ['1.15', 18.4],
    ['1.3', 20.8],
  ] as const) {
    await page.getByTestId(`setting-display-size-${value}`).click();
    await expect(page.getByTestId(`setting-display-size-${value}`)).toHaveAttribute('aria-pressed', 'true');
    expect(await rootSize(page)).toBeCloseTo(size, 1);
    expect((await stored(page)).displaySize).toBe(Number(value));
  }
  await expect
    .poll(() => (gateway.store['pureflow/settings-backup'] as Backup | undefined)?.settings?.displaySize, { timeout: 10_000 })
    .toBe(1.3);

  await page.getByTestId('setting-display-size-1.15').click();
  await page.reload();
  await expect(page.getByTestId('setting-display-size-1.15')).toHaveAttribute('aria-pressed', 'true');
  expect(await rootSize(page)).toBeCloseTo(18.4, 1);
  // Nothing of Decaid's was written for it.
  expect(gateway.requests.filter((request) => request.method !== 'GET' && !request.path.startsWith('/api/v1/store'))).toEqual([]);
});

test("the chart line width widens every graph's curves: the profile picker's preview and the editor's", async ({ page }) => {
  gateway.withDefaults('light');
  await openSkin(page, 'skin-display');
  await expect(page.getByTestId('setting-line-width-1')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'docs/product/settings-display.png' });

  const strokeOf = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).strokeWidth));
  /** px: the preview's solid flow target (0.2 rem) and the editor's curve (0.24 rem) */
  const widths = async () => {
    await home(page);
    await page.getByTestId('open-profiles').click();
    await page.getByTestId('profile-item').filter({ hasText: 'A-Flow / default-dark' }).first().click();
    await expect(page.getByTestId('profile-preview').getByTestId('shot-target-flow')).toBeAttached();
    const preview = await strokeOf('[data-testid="profile-preview"] [data-testid="shot-target-flow"]');
    await home(page);
    await page.getByTestId('open-editor').click();
    await expect(page.locator('[data-testid="line-flow"]').first()).toBeAttached();
    return [preview, await strokeOf('[data-testid="line-flow"]')];
  };
  const [preview, editor] = await widths();
  expect(preview).toBeCloseTo(0.2 * 16, 1);
  expect(editor).toBeCloseTo(0.24 * 16, 1);

  for (const [value, factor] of [
    ['0.6', 0.6],
    ['1.5', 1.5],
    ['2', 2],
  ] as const) {
    await openSkin(page, 'skin-display');
    await page.getByTestId(`setting-line-width-${value}`).click();
    await expect(page.getByTestId(`setting-line-width-${value}`)).toHaveAttribute('aria-pressed', 'true');
    expect((await stored(page)).lineWidth).toBe(factor);
    const [previewNow, editorNow] = await widths();
    expect(previewNow).toBeCloseTo(preview * factor, 1);
    expect(editorNow).toBeCloseTo(editor * factor, 1);
  }
});

test("the skin switch lists Decaid's skins, asks, and opens the chosen one as Decaid's default", async ({ page }) => {
  let opened = '';
  await page.route('http://localhost:27911/**', (route) => {
    opened = route.request().url();
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Insight</title><p>Insight</p>' });
  });
  await openSkin(page, 'skin-active');
  const skins = page.getByTestId('skins').locator('button');
  // The default first, the others by name.
  await expect(skins).toHaveText([/Streamline\.js\s*Default\s*v0\.2\.17 · Bundled/, /Insight\s*v0\.2\.7/, /NSX\s*v0\.4\.3/]);
  await expect(page.getByTestId('skin-streamline.js')).toBeDisabled();
  await page.screenshot({ path: 'docs/product/settings-skins.png' });

  // Cancel leaves everything as it was.
  await page.getByTestId('skin-insight').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('Switch to Insight?');
  await page.getByTestId('settings-confirm-cancel').click();
  await expect(page.getByTestId('settings-confirm')).toHaveCount(0);
  expect(gateway.requests.filter((request) => request.method !== 'GET' && !request.path.startsWith('/api/v1/store'))).toEqual([]);

  await page.getByTestId('skin-insight').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page).toHaveURL('http://localhost:27911/');
  expect(opened).toBe('http://localhost:27911/');
  expect(gateway.defaultSkin).toBe('insight');
  expect(gateway.serving).toBe('insight');
  const order = gateway.requests
    .filter((request) => request.path.startsWith('/api/v1/webui/') && request.method !== 'GET')
    .map((request) => `${request.method} ${request.path}`);
  expect(order).toEqual(['PUT /api/v1/webui/skins/default', 'POST /api/v1/webui/server/stop', 'POST /api/v1/webui/server/start']);
  expect(gateway.calls('PUT', '/api/v1/webui/skins/default')[0].body).toEqual({ skinId: 'insight' });
});

test('a refused switch says why and stays on the page; the update check reads the versions again', async ({ page }) => {
  await page.route('**/api/v1/webui/skins/default', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: '{"error":"refused"}' }) : route.fallback(),
  );
  await openSkin(page, 'skin-active');
  await page.getByTestId('skin-NSX-skin').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('skins-said')).toContainText('refused');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  expect(gateway.defaultSkin).toBe('streamline.js');
  expect(gateway.calls('POST', '/api/v1/webui/server/stop')).toEqual([]);

  gateway.skinUpdates = { 'streamline.js': '0.2.18' };
  await page.getByTestId('skins-update').click();
  await expect(page.getByTestId('skins-said')).toHaveText('Checked: the versions above are what Decaid holds now.');
  await expect(page.getByTestId('skin-streamline.js')).toContainText('v0.2.18');
  expect(gateway.calls('POST', '/api/v1/webui/skins/update')).toHaveLength(1);
});
