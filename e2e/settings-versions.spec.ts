import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// Skin > Skin version against the mocked gateway and a mocked list of GitHub's releases: the
// page asks GitHub only on 'list', shows the releases newest first, installs the latest through
// Decaid's install from a GitHub release under the fixed name and an older one from its versioned
// ZIP's URL, then offers 'reload'; when GitHub cannot be reached it says so and writes nothing.

const MANIFEST = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as { version: string; repository: string };
const VERSION = MANIFEST.version;
const REPO = new URL(MANIFEST.repository).pathname.replace(/^\/|\.git$/g, '');
const RELEASES = `https://api.github.com/repos/${REPO}/releases`;

const asset = (tag: string, name: string) => ({
  name,
  browser_download_url: `https://github.com/${REPO}/releases/download/${tag}/${name}`,
});

/** The latest with the fixed names, the running version, and an old one without the ocr ZIP. */
const LIST = [
  {
    tag_name: `v${VERSION}`,
    published_at: '2026-10-30T19:59:56Z',
    draft: false,
    prerelease: false,
    assets: [asset(`v${VERSION}`, `pureflow-${VERSION}.zip`), asset(`v${VERSION}`, `pureflow-${VERSION}-ocr.zip`)],
  },
  {
    tag_name: 'v99.0.0',
    published_at: '2026-12-01T10:00:00Z',
    draft: false,
    prerelease: false,
    assets: ['pureflow-99.0.0.zip', 'pureflow-99.0.0-ocr.zip', 'pureflow.zip', 'pureflow-ocr.zip'].map((name) =>
      asset('v99.0.0', name),
    ),
  },
  {
    tag_name: 'v0.1.0',
    published_at: '2026-10-01T10:00:00Z',
    draft: false,
    prerelease: false,
    assets: [asset('v0.1.0', 'pureflow-0.1.0.zip')],
  },
];

const errors: string[] = [];
let gateway: MockGateway;
/** every request the page sent to GitHub's API */
let asked: string[];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  asked = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/500 \(Internal Server Error\)|ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(message.text()))
      errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
  gateway.skins.push({ id: 'pureflow', name: 'pureflow', path: '/web-ui/pureflow', version: VERSION, isBundled: false, port: 27920 });
  gateway.defaultSkin = 'pureflow';
  gateway.serving = 'pureflow';
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** GitHub's list as the mocked answer, or no answer at all. */
async function github(page: Page, answer: 'list' | 'unreachable') {
  await page.route('https://api.github.com/**', (route: Route) => {
    asked.push(route.request().url());
    if (answer === 'unreachable') return route.abort('internetdisconnected');
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(LIST),
    });
  });
}

async function openVersions(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'home'));
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await page.getByTestId('settings-sub-skin-version').click();
}

test('lists the releases only on list, installs the latest and an older one through Decaid, then offers reload', async ({ page }) => {
  await github(page, 'list');
  await openVersions(page);
  await expect(page.getByTestId('settings-versions')).toBeVisible();
  // The flavour of the running build is chosen; nothing was asked of GitHub yet.
  await expect(page.getByTestId('version-flavour-base')).toHaveAttribute('aria-pressed', 'true');
  expect(asked).toEqual([]);

  await page.getByTestId('versions-list').click();
  const releases = page.getByTestId('versions').locator('button');
  await expect(releases).toHaveText([/^99\.0\.0\s*latest/, new RegExp(`^${VERSION.replace(/\./g, '\\.')}\\s*running`), /^0\.1\.0/]);
  expect(asked).toEqual([RELEASES]);
  await expect(page.getByTestId('version-99.0.0')).toContainText('pureflow.zip');
  await expect(page.getByTestId(`version-${VERSION}`)).toContainText(`pureflow-${VERSION}.zip`);

  // The other flavour: the fixed and versioned names follow; the old release has no ocr ZIP.
  await page.getByTestId('version-flavour-ocr').click();
  await expect(page.getByTestId('version-99.0.0')).toContainText('pureflow-ocr.zip');
  await expect(page.getByTestId('version-0.1.0')).toBeDisabled();
  await expect(page.getByTestId('version-0.1.0')).toContainText('no ZIP with the bean bag reading');

  // The latest, through Decaid's install from a GitHub release under the fixed name.
  gateway.releaseInstallable = { 'pureflow-ocr.zip': { id: 'pureflow', name: 'pureflow', version: '99.0.0' } };
  await page.getByTestId('version-99.0.0').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('Install pureflow 99.0.0, with the bean bag reading?');
  await expect(page.getByTestId('settings-confirm')).toContainText('installs each newer release of this flavour');
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('versions-said')).toHaveText('Installed pureflow 99.0.0, with the bean bag reading.');
  expect(gateway.calls('POST', '/api/v1/webui/skins/install/github-release')[0].body).toEqual({
    repo: REPO,
    asset: 'pureflow-ocr.zip',
  });
  expect(gateway.skins.find((skin) => skin.id === 'pureflow')?.version).toBe('99.0.0');

  // An older one, from its versioned ZIP's URL.
  await page.getByTestId('version-flavour-base').click();
  const url = `https://github.com/${REPO}/releases/download/v0.1.0/pureflow-0.1.0.zip`;
  gateway.installable = { [url]: { id: 'pureflow', name: 'pureflow', version: '0.1.0' } };
  await page.getByTestId('version-0.1.0').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('keeps this version');
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('versions-said')).toHaveText('Installed pureflow 0.1.0, small.');
  expect(gateway.calls('POST', '/api/v1/webui/skins/install/url')[0].body).toEqual({ url });
  // Decaid's skin server was not touched: it serves the new files on the same port.
  expect(gateway.writes().filter((request) => request.path.startsWith('/api/v1/webui/server'))).toEqual([]);
  expect(asked).toEqual([RELEASES]);

  await page.evaluate(() => ((window as unknown as { beforeReload: boolean }).beforeReload = true));
  await Promise.all([page.waitForEvent('load'), page.getByTestId('versions-reload').click()]);
  expect(await page.evaluate(() => (window as unknown as { beforeReload?: boolean }).beforeReload)).toBeUndefined();
});

test('says when GitHub cannot be reached, and when Decaid refuses the install', async ({ page }) => {
  await github(page, 'unreachable');
  await openVersions(page);
  await page.getByTestId('versions-list').click();
  await expect(page.getByTestId('versions-error')).toContainText('GitHub could not be reached');
  await expect(page.getByTestId('versions-error')).toContainText("Check the tablet's network and list again.");
  await expect(page.getByTestId('versions')).toHaveCount(0);
  expect(gateway.writes().filter((request) => request.path.startsWith('/api/v1/webui/'))).toEqual([]);

  // GitHub answers again; Decaid does not find the asset.
  await page.unroute('https://api.github.com/**');
  await github(page, 'list');
  await page.getByTestId('versions-list').click();
  await page.getByTestId('version-99.0.0').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('versions-said')).toHaveText('Decaid did not install it: Asset not found: pureflow.zip');
  await expect(page.getByTestId('versions-reload')).toHaveCount(0);
});
