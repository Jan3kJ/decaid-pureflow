import { existsSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type { WebUiServerStatus, WebUiSkin } from '../src/api';
import { IDLE } from './idle';

// Skin > Developer, 'Install from a local server', against the rig: `npm run serve-release`'s
// server runs here on its port 24810 over `release/`, the page lists its ZIPs and installs the
// base ZIP through Decaid, which downloads it from the PC's address; Decaid's
// skin list then holds pureflow at this version with the server as its source. The rig serves
// another skin, so the page opens nothing. The test runs only on a rig without pureflow and
// removes it again, with the settings backup put back. Without a gateway:
// e2e/settings-developer.spec.ts.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/pureflow/settings-backup';
const VERSION = (JSON.parse(readFileSync('public/manifest.json', 'utf8')) as { version: string }).version;
const ZIP = 'pureflow.zip';

interface ServeRelease {
  PORT: number;
  makeServer(dir: string): Server;
  lanAddresses(): string[];
}

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<{ state: { state?: string } }>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test("a ZIP of serve-release is installed from the settings and Decaid's skin list shows its version", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  test.skip(!existsSync(join('release', ZIP)), `no release/${ZIP}: run npm run zip first`);
  const skins = await api<WebUiSkin[]>('GET', '/api/v1/webui/skins');
  test.skip(
    skins.some((skin) => skin.id === 'pureflow'),
    'the rig has pureflow installed; the test installs only where it can remove it again',
  );
  const before = {
    default: (await api<WebUiSkin>('GET', '/api/v1/webui/skins/default')).id,
    status: await api<WebUiServerStatus>('GET', '/api/v1/webui/server/status'),
    backup: await api('GET', BACKUP),
  };

  const serve = (await import(pathToFileURL(join(process.cwd(), 'scripts', 'serve-release.mjs')).href)) as ServeRelease;
  const host = serve.lanAddresses()[0] ?? '127.0.0.1';
  const server = serve.makeServer('release');
  await new Promise<void>((resolve) => server.listen(serve.PORT, resolve));
  const url = `http://${host}:${serve.PORT}/${ZIP}`;

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await page.getByTestId('menu').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-category-skin').click();
    await page.getByTestId('settings-sub-skin-backup').click();
    await page.getByTestId('setting-developer').click();
    await page.getByTestId('settings-sub-skin-developer').click();
    await page.getByTestId('local-server').fill(host);
    await page.getByTestId('local-list').click();

    const zip = page.locator(`[data-testid="local-zip"][data-name="${ZIP}"]`);
    await expect(zip).toContainText('kB');
    await zip.click();
    await page.getByTestId('settings-confirm-ok').click();
    await expect(page.getByTestId('local-said')).toHaveText(`Installed pureflow ${VERSION}.`, { timeout: 30_000 });

    const installed = await api<WebUiSkin>('GET', '/api/v1/webui/skins/pureflow');
    expect(installed.version).toBe(VERSION);
    expect(installed.isBundled).toBe(false);
    expect(installed.reaMetadata?.sourceUrl).toBe(url);
    expect((await api<WebUiSkin>('GET', '/api/v1/webui/skins/default')).id).toBe(before.default);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if ((await api<WebUiSkin[]>('GET', '/api/v1/webui/skins')).some((skin) => skin.id === 'pureflow')) {
      await api('DELETE', '/api/v1/webui/skins/pureflow');
    }
    if (before.backup === null || before.backup === undefined) await api('DELETE', BACKUP);
    else await api('POST', BACKUP, before.backup);
  }

  expect((await api<WebUiSkin[]>('GET', '/api/v1/webui/skins')).map((skin) => skin.id)).toEqual(skins.map((skin) => skin.id));
  const after = await api<WebUiServerStatus>('GET', '/api/v1/webui/server/status');
  expect([after.serving, after.path]).toEqual([before.status.serving, before.status.path]);
  expect(await api('GET', BACKUP)).toEqual(before.backup);
});
