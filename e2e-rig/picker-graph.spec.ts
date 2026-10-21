import { expect, test } from '@playwright/test';
import type { MachineSnapshot, ProfileRecord } from '../src/api';
import { pickerEntries, previewLastStepSeconds } from '../src/shell/profiles';
import { stepCurve } from '../src/steps/curve';

// The picker's preview of every profile it lists against the rig (spec 3.10 'Profile picker:
// graphs', acceptance 59): Decaid's bundled profiles and the skin's defaults, each drawn as long
// as its steps longer than 0 s (an A-Flow pour cut where the A-Flow editor cuts it), with a
// border between them, and a dotted limit line only where a step has a limit. The test only
// reads: it stores nothing and loads nothing.

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
  page.on('request', (request) => {
    if (request.url().startsWith(GATEWAY) && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
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
    const curve = stepCurve(entry!.profile, { lastStepSeconds });
    if (curve.t.length === 0) continue;
    await items.and(page.locator(`[data-id="${id}"]`)).click();
    const where = entry!.profile.title;
    await expect(preview.getByTestId('step-preview'), where).toHaveAttribute('data-seconds', String(curve.seconds));
    await expect(preview.getByTestId('shot-border'), where).toHaveCount(curve.steps.length - 1);
    const pressureLimits = curve.pressureLimit.some((value) => value !== null) ? 1 : 0;
    const flowLimits = curve.flowLimit.some((value) => value !== null) ? 1 : 0;
    await expect(preview.getByTestId('shot-limit-pressure'), where).toHaveCount(pressureLimits);
    await expect(preview.getByTestId('shot-limit-flow'), where).toHaveCount(flowLimits);
    limited += pressureLimits || flowLimits;
    if (lastStepSeconds !== undefined) cut += 1;
  }
  console.log(`picker previews: ${ids.length} profiles, ${limited} with a limit, ${cut} A-Flow pours cut`);
  expect(sent).toEqual([]);
});
