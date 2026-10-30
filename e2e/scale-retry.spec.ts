import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The scale reconnects against a mocked gateway: a drop, and a
// scale missing at the start while Decaid knows a preferred scale, are scanned for
// (`GET /api/v1/devices/scan?connect=true&quick=true`) every 5 s, at most 3 times; the warning
// says 'looking for it' meanwhile and 'not connected, tap to retry' after the round; a tap on it
// or on a tare button scans at once and tares nothing. Real time: a round takes 20 s. The same
// against the running gateway: e2e-rig/scale-sleep.spec.ts.

const errors: string[] = [];
const SCAN = '/api/v1/devices/scan';

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
});

test('a dropped scale is scanned for 3 times, 5 s apart; then a tap on the warning scans at once', async ({ page }) => {
  test.setTimeout(60_000);
  const gateway = await mockGateway(page);
  const scanUrls: string[] = [];
  page.on('request', (request) => request.url().includes(SCAN) && scanUrls.push(request.url()));
  await page.goto('/');
  await expect(page.getByTestId('state-scale')).toHaveText('0.0 g');
  expect(gateway.calls('GET', SCAN)).toHaveLength(0);

  const dropped = Date.now();
  gateway.connectScale(false);
  await expect(page.getByTestId('state-scale')).toHaveText('looking for it');
  await expect.poll(() => gateway.calls('GET', SCAN).length, { timeout: 8_000 }).toBe(1);
  expect(Date.now() - dropped).toBeGreaterThan(4_000);
  expect(scanUrls[0]).toMatch(/\/api\/v1\/devices\/scan\?connect=true&quick=true$/);
  await expect.poll(() => gateway.calls('GET', SCAN).length, { timeout: 12_000 }).toBe(3);
  await expect(page.getByTestId('state-scale')).toHaveText('not connected, tap to retry', { timeout: 8_000 });
  await page.waitForTimeout(5_500);
  expect(gateway.calls('GET', SCAN)).toHaveLength(3);
  await page.screenshot({ path: 'e2e/.results/scale-retry-gave-up.png' });

  // A tap on the warning: a scan at once, no tare; this time the scan finds the scale.
  gateway.scanConnectsScale = true;
  await page.getByTestId('scale-retry').click();
  await expect.poll(() => gateway.calls('GET', SCAN).length, { timeout: 2_000 }).toBe(4);
  await expect(page.getByTestId('state-scale')).toHaveText(/ g$/);
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(0);
  await page.waitForTimeout(5_500);
  expect(gateway.calls('GET', SCAN)).toHaveLength(4);
  expect(errors).toEqual([]);
});

test('a scale missing at the start is scanned for without a touch and connects', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.connectScale(false);
  gateway.scanConnectsScale = true;
  await page.goto('/');
  await expect(page.getByTestId('state-scale')).toHaveText('looking for it');
  await expect(page.getByTestId('state-scale')).toHaveText(/ g$/, { timeout: 10_000 });
  expect(gateway.calls('GET', SCAN)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('without a preferred scale no scan starts by itself; the hot water tare scans at once', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.decaidSettings.preferredScaleId = null;
  gateway.connectScale(false);
  await page.goto('/');
  await expect(page.getByTestId('state-scale')).toHaveText('not connected, tap to retry', { timeout: 10_000 });
  expect(gateway.calls('GET', SCAN)).toHaveLength(0);

  await toPage(page, 'hot-water');
  await page.getByTestId('hot-water-tare').click();
  await expect.poll(() => gateway.calls('GET', SCAN).length, { timeout: 2_000 }).toBe(1);
  expect(gateway.calls('PUT', '/api/v1/scale/tare')).toHaveLength(0);
  expect(errors).toEqual([]);
});
