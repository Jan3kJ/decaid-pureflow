import { expect, test, type Page } from '@playwright/test';
import type { MachineSnapshot } from '../src/api';
import type { RigWorkflow } from './gateway';
import { back } from '../e2e/touch';
import { IDLE } from './idle';

// The clean with detergent against the rig. The test starts the run through the API, as the
// machine's own button would; the skin starts none. The simulated machine runs the profile's steps
// at their times, about 140 s, and its flush does not end by itself, so the skin's stop at 10 s ends
// it; its cleaning cycle does not end by itself either, so cancel ends it. The workflow and the
// skin's KV backup are left as found. The two whole runs make this spec take about 6 minutes. The same with a mocked gateway: e2e/detergent-clean.spec.ts.

const GATEWAY = 'http://localhost:8080';
const BACKUP = '/api/v1/store/pureflow/settings-backup';
const TITLE = 'Cleaning/Forward Flush x5';
/** ms, more than Decaid's sequencer may take from the end of a run to saving it */
const SHOT_SAVED_MS = 6000;

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

const machineState = async () => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state;
const workflow = () => api<RigWorkflow>('GET', '/api/v1/workflow');
const caption = (page: Page) => page.getByTestId('maintenance-caption-detergent');

let gatewayUp = false;
/** The machine slept before the spec: it is woken for the runs and put to sleep again after them. */
let wasAsleep = false;

test.beforeAll(async () => {
  try {
    const state = await machineState();
    gatewayUp = state !== undefined;
    wasAsleep = state === 'sleeping';
  } catch {
    gatewayUp = false;
  }
  if (wasAsleep) {
    await api('PUT', '/api/v1/machine/state/idle');
    await expect.poll(machineState, { timeout: 30_000 }).toBe('idle');
  }
});

test.afterAll(async () => {
  if (wasAsleep) await api('PUT', '/api/v1/machine/state/sleeping');
});

/** Runs `body` from the card with its profile loaded; whatever it does, the rig is left as found. */
async function fromCard(page: Page, body: (before: RigWorkflow) => Promise<void>) {
  const before = await workflow();
  const backupBefore = await api('GET', BACKUP);
  const shotsBefore = await api<string[]>('GET', '/api/v1/shots/ids');
  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 30_000 });
    await page.getByTestId('menu').click();
    await page.getByTestId('open-clean').click();
    await page.getByTestId('maintenance-start-detergent').click();
    await page.getByTestId('settings-confirm-ok').click();
    await expect(caption(page)).toHaveText(`${TITLE} is loaded: start it at the machine.`);

    const loaded = await workflow();
    expect(loaded.profile.title).toBe(TITLE);
    expect(loaded.profile.steps.map((step) => step.name)).toEqual([
      'Pressure rise 1',
      'Pause 1',
      'Pressure rise 2',
      'Pause 2',
      'Pressure rise 3',
      'Pause 3',
      'Pressure rise 4',
      'Pause 4',
      'Pressure rise 5',
    ]);
    expect(loaded.context.targetYield).toBe(0);
    // The flush time is the clean's 10 s while it lasts.
    expect(loaded.rinseData.duration).toBe(10);
    expect(await machineState()).toBe('idle');
    await body(before);
  } finally {
    await api('PUT', '/api/v1/machine/state/idle');
    await api('PUT', '/api/v1/workflow', {
      profile: before.profile,
      context: { targetYield: before.context.targetYield ?? 0, targetDoseWeight: before.context.targetDoseWeight },
      rinseData: before.rinseData,
    });
    if (backupBefore === null) await api('DELETE', BACKUP).catch(() => undefined);
    else await api('POST', BACKUP, backupBefore);
  }
  // Decaid keeps no record of a run of a cleaning profile. It decides some seconds after the run.
  await page.waitForTimeout(SHOT_SAVED_MS);
  expect(await api<string[]>('GET', '/api/v1/shots/ids')).toEqual(shotsBefore);
}

async function expectRestored(before: RigWorkflow) {
  await expect.poll(async () => (await workflow()).profile).toEqual(before.profile);
  const after = await workflow();
  expect(after.context.targetYield).toBe(before.context.targetYield);
  expect(after.context.targetDoseWeight).toBe(before.context.targetDoseWeight);
  expect(after.rinseData.duration).toBe(before.rinseData.duration);
}

test('the card loads the profile and follows the run; stopped, it is back at its step, and cancel restores', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  await fromCard(page, async (before) => {
    await api('PUT', '/api/v1/machine/state/espresso');
    await expect(caption(page)).toHaveText('Pressure rise 1', { timeout: 15_000 });
    // The skin stays at the card; home would have opened for another run.
    await expect(page.getByTestId('settings-content')).toBeVisible();
    await expect(caption(page)).toHaveText('Pause 1', { timeout: 30_000 });
    await page.screenshot({ path: 'e2e-rig/.results/detergent-clean-run.png' });

    await api('PUT', '/api/v1/machine/state/idle');
    await expect(caption(page)).toHaveText(`Stopped at the machine. ${TITLE} is loaded: start it at the machine.`, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('detergent-flush')).toHaveCount(0);
    expect((await workflow()).profile.title).toBe(TITLE);

    await page.getByTestId('maintenance-cancel-detergent').click();
    await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible({ timeout: 15_000 });
    await expectRestored(before);
  });
});

test('cancel right after a whole run restores, and Decaid keeps no record of the run', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  await fromCard(page, async (before) => {
    await api('PUT', '/api/v1/machine/state/espresso');
    await expect(caption(page)).toHaveText('Take the portafilter out and flush for 10 s.', { timeout: 170_000 });
    await page.getByTestId('maintenance-cancel-detergent').click();
    await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible({ timeout: 15_000 });
    await expectRestored(before);
  });
});

test('after a whole run the flush ends at 10 s, the cycle is offered, and cancel restores', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  await fromCard(page, async (before) => {
    await api('PUT', '/api/v1/machine/state/espresso');
    await expect(caption(page)).toHaveText('Pressure rise 5', { timeout: 150_000 });
    await expect(caption(page)).toHaveText('Take the portafilter out and flush for 10 s.', { timeout: 30_000 });

    // Home does not draw the cleaning run as a shot: no running or finished graph of it.
    await page.reload();
    await back(page);
    await expect(page.getByTestId('home-shot')).not.toHaveAttribute('data-shot', 'running');
    await page.getByTestId('menu').click();
    await page.getByTestId('open-clean').click();

    await page.getByTestId('detergent-flush').click();
    await expect.poll(machineState).toBe('flush');
    expect((await workflow()).rinseData.duration).toBe(10);
    await expect.poll(machineState, { timeout: 20_000 }).toBe('idle');
    await expect(caption(page)).toHaveText("Last step: the machine's cleaning cycle.", { timeout: 15_000 });

    await page.getByTestId('detergent-cycle').click();
    await page.getByTestId('settings-confirm-ok').click();
    await expect.poll(machineState, { timeout: 15_000 }).toBe('cleaning');
    await expect(caption(page)).toHaveText('Starting');
    expect((await workflow()).profile.title).toBe(TITLE);

    await page.getByTestId('maintenance-cancel-detergent').click();
    await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible();
    await expect.poll(machineState).toBe('idle');
    await expectRestored(before);
  });
});
