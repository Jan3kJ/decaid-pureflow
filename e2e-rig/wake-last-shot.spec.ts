import { expect, test, type Page } from '@playwright/test';
import type { DisplayState, MachineSnapshot, ShotRecordSummary } from '../src/api';
import { IDLE } from './idle';

// Home's graph against the rig: with no shot of its own, home shows the newest shot record at
// the start, after the machine slept and woke, after a page reloaded while it slept (a page
// the tablet froze) and when the page becomes visible again (the tablet's screen on). The test
// makes no shot: it reads the rig's newest one. It wakes the machine and puts the screen's
// brightness back, as it was before.

const GATEWAY = 'http://localhost:8080';

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
let newest: ShotRecordSummary | null = null;

test.beforeAll(async () => {
  try {
    gatewayUp = (await machineState()) !== undefined;
    newest = await api<ShotRecordSummary>('GET', '/api/v1/shots/latest').catch(() => null);
  } catch {
    gatewayUp = false;
  }
});

/** Home shows a finished shot's graph, with its time. */
async function showsShot(page: Page) {
  await expect(page.getByTestId('last-shot')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(page.getByTestId('shot-timer')).toHaveText(/^\d+\.\ds$/);
}

test('wake: home shows the newest shot after a start, a sleep and wake, a reload while asleep and the screen on again', async ({
  page,
}) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/architecture.md, The rig)`);
  test.skip(newest === null, 'the rig holds no shot');
  const displayBefore = await api<DisplayState>('GET', '/api/v1/display');
  const reads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/api/v1/shots/')) reads.push(new URL(request.url()).pathname);
  });

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await showsShot(page);
    expect(reads).toContain(`/api/v1/shots/${newest!.id}`);
    const seconds = await page.getByTestId('shot-timer').textContent();

    // The machine sleeps (its own timer or another client), and the page reloads meanwhile.
    await api('PUT', '/api/v1/machine/state/sleeping');
    await expect.poll(machineState, { timeout: 15_000 }).toBe('sleeping');
    await expect(page.getByTestId('asleep')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId('asleep')).toBeVisible({ timeout: 15_000 });
    await showsShotUnder(page);

    // A touch wakes it: the newest shot again.
    reads.length = 0;
    await page.getByTestId('asleep').dispatchEvent('pointerdown');
    await expect.poll(machineState, { timeout: 15_000 }).not.toBe('sleeping');
    await expect(page.getByTestId('asleep')).toHaveCount(0, { timeout: 15_000 });
    await showsShot(page);
    await expect(page.getByTestId('shot-timer')).toHaveText(seconds!);
    await expect.poll(() => reads.filter((path) => path === '/api/v1/shots/latest').length).toBeGreaterThan(0);

    // The tablet's screen off and on.
    reads.length = 0;
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => reads.filter((path) => path === '/api/v1/shots/latest').length).toBeGreaterThan(0);
    await showsShot(page);
    await expect(page.getByTestId('shot-timer')).toHaveText(seconds!);
  } finally {
    if ((await machineState().catch(() => undefined)) === 'sleeping') await api('PUT', '/api/v1/machine/state/idle');
    if (displayBefore.platformSupported?.brightness === true) {
      await api('PUT', '/api/v1/display/brightness', { brightness: displayBefore.requestedBrightness ?? 100 });
    }
  }
  expect(await machineState()).not.toBe('sleeping');
  expect((await api<DisplayState>('GET', '/api/v1/display')).requestedBrightness).toBe(displayBefore.requestedBrightness);
});

/** Under the Asleep screen, home holds the newest shot already (it is read when the streams open). */
async function showsShotUnder(page: Page) {
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished', { timeout: 15_000 });
}
