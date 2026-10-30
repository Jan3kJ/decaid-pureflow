import { expect, test } from '@playwright/test';
import type { DecaidSettings, MachineSnapshot, WebUiServerStatus, WebUiSkin } from '../src/api';
import type { RigWorkflow } from './gateway';
import { IDLE } from './idle';

// Skin > Active Skin against the rig: the page lists the
// rig's installed skins with Decaid's default marked, and a switch makes another skin Decaid's
// default, starts its skin server again and opens the port it serves on. The other skin is not
// loaded: its page is answered here, so it changes nothing in Decaid. The test records the default
// skin and what the skin server serves first, switches back through the gateway as the page does
// and checks both afterwards, with Decaid's settings and the workflow. Without a gateway:
// e2e/settings-skin.spec.ts.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/pureflow/settings-backup';
const TARGET = 'insight';

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
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

/** The skin server serving again, as the page waits for it. */
async function served(): Promise<WebUiServerStatus> {
  let status: WebUiServerStatus = { serving: false };
  await expect
    .poll(
      async () => {
        status = await api<WebUiServerStatus>('GET', '/api/v1/webui/server/status').catch(() => ({ serving: false }));
        return status.serving && !!status.port;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return status;
}

test("the skin switch makes another skin Decaid's default and opens it; the default is put back", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const skins = await api<WebUiSkin[]>('GET', '/api/v1/webui/skins');
  const before = {
    default: (await api<WebUiSkin>('GET', '/api/v1/webui/skins/default')).id,
    status: await api<WebUiServerStatus>('GET', '/api/v1/webui/server/status'),
    settings: await api<DecaidSettings>('GET', '/api/v1/settings'),
    profile: (await api<RigWorkflow>('GET', '/api/v1/workflow')).profile.title,
    backup: await api('GET', BACKUP),
  };
  console.log('before', JSON.stringify({ default: before.default, status: before.status, profile: before.profile }));
  test.skip(!skins.some((skin) => skin.id === TARGET) || before.default === TARGET, `the rig has no ${TARGET} to switch to`);
  const target = skins.find((skin) => skin.id === TARGET)!;

  // Another skin's page is answered here; the skin's own and the gateway's requests go through.
  const own = new URL(test.info().project.use.baseURL!).port;
  const opened: string[] = [];
  await page.route(
    (url) => url.hostname === 'localhost' && url.port !== own && url.port !== '8080',
    (route) => {
      opened.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>other skin</title>' });
    },
  );

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await page.getByTestId('menu').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-category-skin').click();
    await page.getByTestId('settings-sub-skin-active').click();

    const list = page.getByTestId('skins').locator('button');
    await expect(list).toHaveCount(skins.length);
    await expect(list.first()).toHaveAttribute('data-testid', `skin-${before.default}`);
    await expect(page.getByTestId(`skin-${before.default}`).getByTestId('skin-default')).toBeVisible();
    await expect(page.getByTestId(`skin-${TARGET}`)).toContainText(target.name);

    await page.getByTestId(`skin-${TARGET}`).click();
    await page.getByTestId('settings-confirm-ok').click();
    await expect.poll(() => opened.length, { timeout: 30_000 }).toBeGreaterThan(0);

    expect((await api<WebUiSkin>('GET', '/api/v1/webui/skins/default')).id).toBe(TARGET);
    const status = await served();
    expect(status.path).toBe(target.path);
    expect(opened[0]).toBe(`http://localhost:${status.port}/`);
    await expect(page).toHaveURL(`http://localhost:${status.port}/`);
  } finally {
    // Back as the page switches: the default, then the skin server started again.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await api('PUT', '/api/v1/webui/skins/default', { skinId: before.default });
    await api('POST', '/api/v1/webui/server/stop');
    await api('POST', '/api/v1/webui/server/start');
    const status = await served();
    console.log('after', JSON.stringify(status));
    if (before.backup === null || before.backup === undefined) await api('DELETE', BACKUP);
    else await api('POST', BACKUP, before.backup);
  }

  expect((await api<WebUiSkin>('GET', '/api/v1/webui/skins/default')).id).toBe(before.default);
  const after = await api<WebUiServerStatus>('GET', '/api/v1/webui/server/status');
  expect([after.serving, after.path]).toEqual([before.status.serving, before.status.path]);
  expect(await api<DecaidSettings>('GET', '/api/v1/settings')).toEqual(before.settings);
  expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).profile.title).toBe(before.profile);
  expect(await api('GET', BACKUP)).toEqual(before.backup);
});
