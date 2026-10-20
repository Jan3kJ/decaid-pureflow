import { expect, test, type Page } from '@playwright/test';
import { IDLE } from './idle';

// Plugins, presence and firmware against the rig (research.md 20.10 S2c): a plugin setting
// changed through the page, read back from the gateway and restored (read back, and written a
// second time when the first restore did not hold, as S1 saw once); the sleep timeout changed
// and restored; a wake schedule created and deleted through the page; the firmware catalog
// shown, and its Install asks first and is cancelled: no firmware is applied here, no plugin is
// enabled, disabled or updated. The test records what it changes before and checks it
// afterwards. Without a gateway: e2e/settings-extensions.spec.ts.

const GATEWAY = 'http://localhost:8080';
const PLUGIN = 'time-to-ready.reaplugin';
const KEY = 'Stabilisation';

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : undefined;
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

async function openCategory(page: Page, id: string) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId(`settings-category-${id}`).click();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', id);
}

async function type(page: Page, testid: string, value: string) {
  await page.getByTestId(testid).click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of value) await page.getByTestId(`numpad-key-${key === '.' ? 'dot' : key}`).click();
  await page.getByTestId('numpad-confirm').click();
  await expect(page.getByTestId('numpad')).toHaveCount(0);
}

/** Every plugin's loaded state and version: nothing here may change them. */
async function pluginStates() {
  const plugins: any[] = await api('GET', '/api/v1/plugins');
  return plugins.map((plugin) => `${plugin.id} ${plugin.version} loaded=${plugin.loaded}`).sort();
}

test('a plugin setting changed through the page is read back and restored', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const before = await api('GET', `/api/v1/plugins/${PLUGIN}/settings`);
  const states = await pluginStates();
  console.log('before', JSON.stringify(before), JSON.stringify(states));
  const changed = before[KEY] === 7 ? 8 : 7;

  try {
    await openCategory(page, 'extensions');
    await expect(page.getByTestId(`plugin-${PLUGIN}`)).toBeVisible({ timeout: 15_000 });
    await type(page, `plugin-setting-${PLUGIN}-${KEY}`, String(changed));
    await expect(page.getByTestId(`plugin-setting-${PLUGIN}-${KEY}`)).toHaveText(String(changed));
    expect((await api('GET', `/api/v1/plugins/${PLUGIN}/settings`))[KEY]).toBe(changed);
  } finally {
    // A key that was not stored is cleared with null; the restore is read back and written once more if it did not hold.
    const restore = { [KEY]: before[KEY] ?? null };
    for (let attempt = 1; attempt <= 2; attempt++) {
      await api('POST', `/api/v1/plugins/${PLUGIN}/settings`, restore);
      const after = await api('GET', `/api/v1/plugins/${PLUGIN}/settings`);
      console.log(`restore ${attempt}`, JSON.stringify(after));
      if (JSON.stringify(after) === JSON.stringify(before)) break;
    }
  }
  expect(await api('GET', `/api/v1/plugins/${PLUGIN}/settings`)).toEqual(before);
  expect(await pluginStates()).toEqual(states);
});

test('the sleep timeout changed through the page is read back and restored; a wake schedule is created and deleted', async ({
  page,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const before = await api('GET', '/api/v1/presence/settings');
  console.log('before', JSON.stringify(before));
  const minutes = before.sleepTimeoutMinutes === 31 ? 32 : 31;
  const known = new Set((before.schedules ?? []).map((schedule: any) => schedule.id));

  try {
    await openCategory(page, 'miscellaneous');
    await page.getByTestId('settings-sub-presence').click();
    await expect(page.getByTestId('setting-sleep-timeout')).toContainText(String(before.sleepTimeoutMinutes));
    await type(page, 'setting-sleep-timeout', String(minutes));
    await expect(page.getByTestId('setting-sleep-timeout')).toContainText(String(minutes));
    expect((await api('GET', '/api/v1/presence/settings')).sleepTimeoutMinutes).toBe(minutes);
    await type(page, 'setting-sleep-timeout', String(before.sleepTimeoutMinutes));
    await expect(page.getByTestId('setting-sleep-timeout')).toContainText(String(before.sleepTimeoutMinutes));

    await page.getByTestId('schedule-add').click();
    await type(page, 'schedule-time', '0547');
    await page.getByTestId('schedule-day-6').click();
    await type(page, 'schedule-keep-awake', '15');
    await page.getByTestId('schedule-save').click();
    await expect(page.getByTestId('schedule-form')).toHaveCount(0);
    const created = (await api('GET', '/api/v1/presence/settings')).schedules.filter((schedule: any) => !known.has(schedule.id));
    console.log('created', JSON.stringify(created));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ time: '05:47', daysOfWeek: [6], enabled: true, keepAwakeFor: 15 });
    await expect(page.getByTestId(`schedule-text-${created[0].id}`)).toHaveText('05:47, Sat, awake for 15 min');

    await page.getByTestId(`schedule-delete-${created[0].id}`).click();
    await page.getByTestId('settings-confirm-ok').click();
    await expect(page.getByTestId(`schedule-${created[0].id}`)).toHaveCount(0);
  } finally {
    const now = await api('GET', '/api/v1/presence/settings');
    for (const schedule of now.schedules ?? []) {
      if (!known.has(schedule.id)) await api('DELETE', `/api/v1/presence/schedules/${schedule.id}`);
    }
    if (now.sleepTimeoutMinutes !== before.sleepTimeoutMinutes || now.userPresenceEnabled !== before.userPresenceEnabled) {
      await api('POST', '/api/v1/presence/settings', {
        sleepTimeoutMinutes: before.sleepTimeoutMinutes,
        userPresenceEnabled: before.userPresenceEnabled,
      });
    }
  }
  const after = await api('GET', '/api/v1/presence/settings');
  console.log('after', JSON.stringify(after));
  expect(after).toEqual(before);
});

test('the firmware catalog is shown; Install asks first and is cancelled, nothing is applied', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const catalog = await api('GET', '/api/v1/machine/firmware');
  const update = await api('GET', '/api/v1/update');
  console.log(
    'catalog',
    JSON.stringify({ machine: catalog.machine, recommended: catalog.recommendedArtifactId, updateAvailable: catalog.updateAvailable }),
  );

  const applies: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/machine/firmware/apply')) applies.push(request.method());
  });
  await openCategory(page, 'updates');
  for (const artifact of catalog.artifacts) await expect(page.getByTestId(`firmware-artifact-${artifact.id}`)).toBeVisible();
  await expect(page.getByTestId('firmware-installed')).toHaveText(String(catalog.machine?.build ?? '–'));
  const status =
    catalog.updateAvailable === true ? 'update-available' : catalog.updateAvailable === false ? /up-to-date|ahead/ : 'unknown';
  await expect(page.getByTestId('firmware-status')).toHaveAttribute('data-status', status);
  await expect(page.getByTestId('app-update')).toContainText(update.currentVersion);

  if (catalog.updateAvailable === true) {
    await page.getByTestId('firmware-install').click();
    await expect(page.getByTestId('settings-confirm')).toContainText('50 minutes');
    await page.getByTestId('settings-confirm-cancel').click();
    await expect(page.getByTestId('settings-confirm')).toHaveCount(0);
  }
  expect(applies).toEqual([]);
  expect((await api('GET', '/api/v1/machine/firmware')).operation.state).toBe('idle');
});
