import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Backup } from '../src/settings-backup';
import { mockGateway, type MockGateway } from './mock-gateway';

// Skin > Backup and version > developer options and Skin > Developer, 'Install from a local
// server', against the mocked gateway; the PC's server is answered here as `npm run serve-release`
// (index.json with CORS) or Python's `http.server` (no CORS header) answer. The install against the
// running gateway: e2e-rig/settings-developer.spec.ts.

const VERSION = (JSON.parse(readFileSync('public/manifest.json', 'utf8')) as { version: string }).version;
const SERVER = 'http://192.168.1.20:24810';
const NEXT = 'pureflow-9.9.9.zip';

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    const text = message.text();
    // a refused install's 500, and the browser's refusal of a listing without CORS
    if (
      message.type() === 'error' &&
      !text.includes('500 (Internal Server Error)') &&
      !text.includes('CORS') &&
      !text.includes('ERR_FAILED')
    ) {
      errors.push(text);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** The server of `npm run serve-release`: index.json, to any origin. */
async function serveRelease(page: Page) {
  await page.route(`${SERVER}/index.json`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([
        { name: NEXT, size: 150_000, modified: '2026-11-02T09:00:00.000Z', sha256: null },
        { name: `pureflow-${VERSION}-ocr.zip`, size: 13_504_278, modified: '2026-10-31T15:00:32.563Z', sha256: null },
        { name: `pureflow-${VERSION}.zip`, size: 147_483, modified: '2026-10-31T15:00:32.548Z', sha256: null },
      ]),
    }),
  );
}

/**
 * Python's `http.server`: its answers carry no CORS header, so the browser keeps them from the
 * page, which sees a failed request. A fulfilled route skips that check, so the requests fail here.
 */
async function servePython(page: Page) {
  await page.route(`${SERVER}/**`, (route) => route.abort('failed'));
}

async function openSkin(page: Page, sub: string) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'home'));
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await page.getByTestId(`settings-sub-${sub}`).click();
}

async function developerOn(page: Page) {
  await openSkin(page, 'skin-backup');
  await page.getByTestId('setting-developer').click();
  await page.getByTestId('settings-sub-skin-developer').click();
}

async function list(page: Page) {
  await page.getByTestId('local-server').fill('192.168.1.20');
  await page.getByTestId('local-list').click();
}

test('developer options are off by default, show Skin > Developer when on, stay on this tablet and are not backed up', async ({
  page,
}) => {
  await openSkin(page, 'skin-backup');
  const lever = page.getByTestId('setting-developer');
  await expect(lever).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('settings-sub-skin-developer')).toHaveCount(0);
  await expect(page.getByTestId('settings-developer')).toHaveCount(0);

  await lever.click();
  await expect(lever).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('settings-sub-skin-developer')).toHaveText('Developer');
  await page.getByTestId('settings-sub-skin-developer').click();
  await expect(page.getByTestId('settings-developer')).toContainText('install from a local server');
  await page.screenshot({ path: 'docs/product/settings-developer.png' });

  await page.reload();
  await expect(page.getByTestId('setting-developer')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('settings-sub-skin-developer')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pureflow.developer'))).toBe('on');

  await page.getByTestId('setting-developer').click();
  await expect(page.getByTestId('settings-sub-skin-developer')).toHaveCount(0);
  await expect(page.getByTestId('settings-developer')).toHaveCount(0);
  // Nothing of it in the settings or their backup, and nothing written to Decaid.
  const backup = gateway.store['pureflow/settings-backup'] as Backup | undefined;
  expect(JSON.stringify(backup ?? {})).not.toContain('developer');
  expect(await page.evaluate(() => localStorage.getItem('pureflow.settings') ?? '')).not.toContain('developer');
  expect(gateway.writes().filter((request) => !request.path.startsWith('/api/v1/store'))).toEqual([]);
});

test('a listed ZIP is installed after the question; Decaid serves it, so the page opens it again', async ({ page }) => {
  // pureflow is Decaid's default skin and served on port 27920.
  gateway.skins.push({ id: 'pureflow', name: 'pureflow', path: '/web-ui/pureflow', version: VERSION, isBundled: false, port: 27920 });
  gateway.defaultSkin = 'pureflow';
  gateway.serving = 'pureflow';
  gateway.installable[`${SERVER}/${NEXT}`] = { id: 'pureflow', name: 'pureflow', version: '9.9.9' };
  let opened = '';
  await page.route('http://localhost:27920/**', (route) => {
    opened = route.request().url();
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>pureflow</title>' });
  });
  await serveRelease(page);
  await developerOn(page);
  await list(page);

  const zips = page.getByTestId('local-zip');
  await expect(zips).toHaveText([
    new RegExp(`^${NEXT}\\s*150 kB · 2 Nov, \\d\\d:00$`),
    new RegExp(`pureflow-${VERSION}-ocr\\.zip\\s*13\\.5 MB`),
    new RegExp(`pureflow-${VERSION}\\.zip\\s*running\\s*147 kB`),
  ]);
  await expect(page.getByTestId('local-running')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('pureflow.local-server'))).toBe('192.168.1.20');
  await page.screenshot({ path: 'docs/product/settings-developer-list.png' });

  // Cancel installs nothing.
  await zips.first().click();
  await expect(page.getByTestId('settings-confirm')).toContainText(`Install ${NEXT}?`);
  await expect(page.getByTestId('settings-confirm')).toContainText(`It replaces pureflow ${VERSION} on this tablet.`);
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.calls('POST', '/api/v1/webui/skins/install/url')).toEqual([]);

  await zips.first().click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page).toHaveURL('http://localhost:27920/');
  expect(opened).toBe('http://localhost:27920/');
  expect(gateway.calls('POST', '/api/v1/webui/skins/install/url')[0].body).toEqual({ url: `${SERVER}/${NEXT}` });
  expect(gateway.skins.find((skin) => skin.id === 'pureflow')?.version).toBe('9.9.9');
  const order = gateway.requests
    .filter((request) => request.path.startsWith('/api/v1/webui/') && request.method !== 'GET')
    .map((request) => `${request.method} ${request.path}`);
  expect(order).toEqual([
    'POST /api/v1/webui/skins/install/url',
    'PUT /api/v1/webui/skins/default',
    'POST /api/v1/webui/server/stop',
    'POST /api/v1/webui/server/start',
  ]);
});

test("a skin Decaid does not serve is installed without a restart; Decaid's error is shown", async ({ page }) => {
  gateway.installable[`${SERVER}/${NEXT}`] = { id: 'pureflow', name: 'pureflow', version: '9.9.9' };
  await serveRelease(page);
  await developerOn(page);
  await list(page);
  await page.getByTestId('local-zip').first().click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('local-said')).toHaveText('Installed pureflow 9.9.9.');
  expect(gateway.calls('POST', '/api/v1/webui/server/stop')).toEqual([]);
  await expect(page.getByTestId('screen-settings')).toBeVisible();

  // The ocr ZIP is not on the mocked server's list of what Decaid can download.
  await page.getByTestId('local-zip').nth(1).click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('local-said')).toHaveText('Decaid did not install it: Failed to download: 404');
});

test("a server without CORS, as Python's, offers the typed name, filled with this version's ZIP", async ({ page }) => {
  gateway.installable[`${SERVER}/pureflow-${VERSION}-ocr.zip`] = { id: 'pureflow', name: 'pureflow', version: VERSION };
  await servePython(page);
  await developerOn(page);
  await page.getByTestId('local-server').fill('http://192.168.1.20:24810');
  await page.getByTestId('local-list').click();
  await expect(page.getByTestId('local-unread')).toContainText("a server without CORS, as Python's, does not allow it");
  await expect(page.getByTestId('local-zips')).toHaveCount(0);
  const name = page.getByTestId('local-name');
  await expect(name).toHaveValue(`pureflow-${VERSION}.zip`);
  await expect(page.getByTestId('local-name-chip')).toHaveText([`pureflow-${VERSION}.zip`, `pureflow-${VERSION}-ocr.zip`]);
  await page.screenshot({ path: 'docs/product/settings-developer-typed.png' });

  await page.getByTestId('local-name-chip').nth(1).click();
  await expect(name).toHaveValue(`pureflow-${VERSION}-ocr.zip`);
  await page.getByTestId('local-install').click();
  await expect(page.getByTestId('settings-confirm')).toContainText(`Install pureflow-${VERSION}-ocr.zip?`);
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('local-said')).toHaveText(`Installed pureflow ${VERSION}.`);
  expect(gateway.calls('POST', '/api/v1/webui/skins/install/url')[0].body).toEqual({ url: `${SERVER}/pureflow-${VERSION}-ocr.zip` });
});
