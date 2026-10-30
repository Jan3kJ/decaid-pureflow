import { expect, test } from '@playwright/test';
import type { MachineSnapshot, PaginatedShots } from '../src/api';
import { IDLE } from './idle';

// The state line's temperatures, filtered against the rig: when a shot starts
// the simulated machine drops its group by far more than 5 °C in one frame (15.5 °C, seen
// on the rig), which restarts the filter, and heats it back at 1 to 5 °C a second, which the
// state line follows in small steps. The test removes the shot record it makes; the workflow is
// not changed.

const GATEWAY = 'http://localhost:8080';
/** ms the state line is watched after the shot starts */
const WATCH_MS = 10_000;

async function api<T = unknown>(method: string, path: string): Promise<T> {
  const response = await fetch(GATEWAY + path, { method, signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const shotIds = async (): Promise<string[]> =>
  (await api<PaginatedShots>('GET', '/api/v1/shots?limit=100')).items.map((shot: { id: string }) => shot.id);

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

/** The largest change between two neighbours of a list. */
const largestStep = (values: number[]) => Math.max(...values.slice(1).map((value, i) => Math.abs(value - values[i])));

test("the state line takes the group's drop at once and its heating in small steps", async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const shotsBefore = await shotIds();
  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await expect(page.getByTestId('state-group')).toHaveText(/^\d+\.\d °C$/);

    // The page samples the state line every 100 ms and keeps the raw frames of its own stream.
    await page.evaluate(
      ({ url, ms }) => {
        const shown: number[] = [];
        const raw: number[] = [];
        const socket = new WebSocket(url);
        socket.onmessage = (event) => raw.push((JSON.parse(event.data as string) as MachineSnapshot).groupTemperature);
        const timer = setInterval(() => {
          const text = document.querySelector('[data-testid="state-group"]')?.textContent ?? '';
          const value = parseFloat(text);
          if (Number.isFinite(value)) shown.push(value);
        }, 100);
        (window as unknown as { watched: Promise<{ shown: number[]; raw: number[] }> }).watched = new Promise((resolve) =>
          setTimeout(() => {
            clearInterval(timer);
            socket.close();
            resolve({ shown, raw });
          }, ms),
        );
      },
      { url: `${GATEWAY.replace('http', 'ws')}/ws/v1/machine/snapshot`, ms: WATCH_MS },
    );
    await api('PUT', '/api/v1/machine/state/espresso');
    const { shown, raw } = await page.evaluate(
      () => (window as unknown as { watched: Promise<{ shown: number[]; raw: number[] }> }).watched,
    );
    await page.screenshot({ path: 'e2e-rig/.results/temp-filter-rig.png' });

    const drop = largestStep(raw);
    const lowest = shown.indexOf(Math.min(...shown));
    const climb = shown.slice(lowest);
    console.log(
      `raw: ${raw.length} frames, ${Math.min(...raw).toFixed(2)}..${Math.max(...raw)} °C, largest step ${drop.toFixed(2)} °C`,
    );
    console.log(
      `state line: ${shown.length} samples, ${shown[lowest]}..${Math.max(...shown)} °C, climbing by ${largestStep(climb).toFixed(2)} °C at most`,
    );
    // The drop is a jump: the state line takes it at once.
    expect(drop).toBeGreaterThan(5);
    expect(shown[lowest]).toBeLessThanOrEqual(Math.min(...raw) + 0.1);
    // The heating after it: the line climbs by more than 5 °C in steps of under 1 °C.
    expect(climb.at(-1)! - shown[lowest]).toBeGreaterThan(5);
    expect(largestStep(climb)).toBeLessThan(1);
    expect(new Set(climb).size).toBeGreaterThan(20);
  } finally {
    const state = await api<MachineSnapshot>('GET', '/api/v1/machine/state').catch(() => undefined);
    if (state?.state.state === 'espresso') await api('PUT', '/api/v1/machine/state/idle');
    // The record of a shot is written a few seconds after its end.
    await page.waitForTimeout(5000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
    }
  }

  expect(await shotIds()).toEqual(shotsBefore);
});
