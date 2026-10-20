import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot } from '../src/api';
import type { RigWorkflow } from './gateway';
import { swipe } from '../e2e/touch';
import { IDLE } from './idle';

// The row of pages against the rig (T6, spec 3.8, acceptance item 32): from home a swipe to
// the left opens steam with its machine values, back to home, and a swipe to the right opens
// hot water. Moving between pages writes nothing to the machine; the test checks the workflow
// is as it was and leaves the skin's KV namespace as it found it.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/pureflow/settings-backup';

async function api<T = unknown>(method: string, path: string): Promise<T> {
  const response = await fetch(GATEWAY + path, { method, signal: AbortSignal.timeout(15_000) });
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

/** The shown page: the one screen that is not the neighbour coming in. */
const shown = (page: Page, screen: string) => page.locator(`.page:not([inert]) [data-testid="screen-${screen}"]`);

test('a swipe opens steam and hot water from home, and writes nothing to the machine', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const backupBefore = await api('GET', BACKUP);
  const workflowWrites: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(`${GATEWAY}/api/v1/workflow`) && request.method() !== 'GET') workflowWrites.push(request.method());
  });

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });

    await swipe(page, { x: 800, y: 500 }, { x: 300, y: 500 });
    await expect(shown(page, 'steam')).toBeVisible();
    // The steam page with the rig's own values: its timer is the machine's.
    await expect(page.getByTestId('steam-timer')).toHaveText(/^\d+s$/, { timeout: 15_000 });

    await swipe(page, { x: 300, y: 500 }, { x: 800, y: 500 });
    await expect(shown(page, 'home')).toBeVisible();
    await swipe(page, { x: 400, y: 500 }, { x: 900, y: 500 });
    await expect(shown(page, 'hot-water')).toBeVisible();
    await expect(page.getByTestId('hot-water-temperature')).toContainText('°C', { timeout: 15_000 });
    await swipe(page, { x: 900, y: 500 }, { x: 400, y: 500 });
    await expect(shown(page, 'home')).toBeVisible();
    await expect(page.locator('.page')).toHaveCount(1);
  } finally {
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
  }
  expect(workflowWrites).toEqual([]);
  expect(await api<RigWorkflow>('GET', '/api/v1/workflow')).toEqual(workflowBefore);
  expect(await api('GET', BACKUP)).toEqual(backupBefore);
});
