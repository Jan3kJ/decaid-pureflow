import { expect, test } from '@playwright/test';
import type { MachineSnapshot } from '../src/api';
import { cleanWater } from '../src/settings-page/water-tank';
import { waterLevels } from './gateway';
import { IDLE } from './idle';

// The menu's clean against the rig: home's menu opens
// the settings page on Maintenance's clean, which shows the tank's water in ml as the state line
// converts the level of `/ws/v1/machine/waterLevels` (Decaid 0.8.8 has no REST request for it:
// `GET /api/v1/machine/waterLevels` is 404), and the drip tray hint. Nothing is started; the
// machine's state and the skin's KV backup are left as found. The same with a mocked gateway:
// e2e/menu-clean.spec.ts.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/pureflow/settings-backup';

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const machineState = async (): Promise<string> => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state;

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test("home menu: clean opens Maintenance's clean with the rig's water in ml and the drip tray hint (item 35)", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);

  const stateBefore = await machineState();
  const backupBefore = await api('GET', BACKUP);
  const levels = await waterLevels(GATEWAY);

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });
    await page.getByTestId('menu').click();
    await page.getByTestId('open-clean').click();
    await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', 'maintenance');
    await expect(page.getByTestId('maintenance-clean')).toBeInViewport();
    await expect(page.getByTestId('maintenance-water-clean')).toHaveText(`water tank: ${cleanWater(levels).ml} ml`, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('maintenance-water-low-clean')).toHaveCount(cleanWater(levels).low ? 1 : 0);
    await expect(page.getByTestId('maintenance-drip-tray-clean')).toHaveText('empty the drip tray before starting.');
    await expect(page.getByTestId('maintenance-start-clean')).toBeEnabled();
    await page.screenshot({ path: 'e2e-rig/.results/menu-clean-rig.png' });
  } finally {
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
    else await api('POST', BACKUP, backupBefore);
  }

  expect(await machineState()).toBe(stateBefore);
  expect(await api('GET', BACKUP)).toEqual(backupBefore);
});
