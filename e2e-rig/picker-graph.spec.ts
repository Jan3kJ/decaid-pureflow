import { expect, test } from '@playwright/test';
import { isWrite } from './gateway';
import type { MachineSnapshot, ProfileRecord } from '../src/api';
import { pickerEntries, previewLastStepSeconds } from '../src/shell/profiles';
import { shotEstimate } from '../src/steps/estimate';

// The picker's preview of every profile it lists against the rig (spec 3.10 'Profile picker:
// graphs', acceptance 59; spec 3.16 'The picture', acceptance 112): Decaid's bundled profiles
// and the skin's defaults, each drawn as its modelled shot, as long as the model runs it, with a
// border where the model starts each step, the targets dotted, a dotted limit line only where a
// step has a limit, and no console error. The test only reads: it stores nothing and loads nothing.

const GATEWAY = 'http://localhost:8080';

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

test('the picker previews every listed profile as its steps say', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);
  test.setTimeout(180_000);
  const sent: string[] = [];
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (isWrite(request, GATEWAY)) {
      sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const items = page.getByTestId('profile-item');
  await expect(items.filter({ hasText: 'A-Flow / default-very-dark' })).toHaveCount(1, { timeout: 15_000 });
  const ids = await items.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-id')!));
  const entries = pickerEntries(await api<ProfileRecord[]>('GET', '/api/v1/profiles'));
  const preview = page.getByTestId('profile-preview');
  let limited = 0;
  let cut = 0;

  for (const id of ids) {
    const entry = entries.find((candidate) => candidate.id === id);
    expect(entry, `the gateway lists ${id}`).toBeTruthy();
    const lastStepSeconds = previewLastStepSeconds(entry!);
    const estimate = shotEstimate(entry!.profile, { lastStepSeconds });
    if (estimate.t.length === 0) continue;
    await items.and(page.locator(`[data-id="${id}"]`)).click();
    const where = entry!.profile.title;
    await expect(preview.getByTestId('step-preview'), where).toHaveAttribute('data-seconds', String(estimate.seconds));
    await expect(preview.getByTestId('shot-graph'), where).toHaveAttribute('data-points', String(estimate.t.length));
    await expect(preview.getByTestId('shot-border'), where).toHaveCount(estimate.borders.length);
    await expect(preview.getByTestId('shot-target-temperature'), where).toHaveClass(/dotted/);
    const pressureLimits = estimate.pressureLimit.some((value) => value !== null) ? 1 : 0;
    const flowLimits = estimate.flowLimit.some((value) => value !== null) ? 1 : 0;
    await expect(preview.getByTestId('shot-limit-pressure'), where).toHaveCount(pressureLimits);
    await expect(preview.getByTestId('shot-limit-flow'), where).toHaveCount(flowLimits);
    limited += pressureLimits || flowLimits;
    if (lastStepSeconds !== undefined) cut += 1;
  }
  console.log(`picker previews: ${ids.length} profiles, ${limited} with a limit, ${cut} A-Flow pours cut`);
  expect(sent).toEqual([]);
  expect(errors).toEqual([]);
});
