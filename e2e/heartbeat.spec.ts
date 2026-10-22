import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// A touch of the skin sends Decaid a heartbeat, so the machine sleeps after the presence
// setting's minutes from the last touch (spec 3.12, acceptance 75): at most one every 30 s, on
// every screen, none while the machine sleeps, a failed one without a notice. The same against
// the running gateway: e2e-rig/heartbeat.spec.ts.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const heartbeats = (gateway: MockGateway) => () => gateway.calls('POST', '/api/v1/machine/heartbeat').length;

/** A touch on the skin that is not a control: the screen's own background. */
async function touch(page: Page, screen = 'screen-home') {
  await page.getByTestId(screen).dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: 640, clientY: 400 });
  await page.getByTestId(screen).dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, clientX: 640, clientY: 400 });
}

test('a touch sends a heartbeat, at most one every 30 s, on every screen', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  const sent = heartbeats(gateway);
  // Nothing without a touch.
  await page.clock.runFor(60_000);
  expect(sent()).toBe(0);

  await touch(page);
  await expect.poll(sent).toBe(1);
  await touch(page);
  await page.clock.runFor(29_000);
  await touch(page);
  await page.waitForTimeout(300);
  expect(sent()).toBe(1);

  // 30 s after the last one, the next touch sends again: here on the steam page.
  await page.clock.runFor(1_000);
  await page.getByTestId('page-dot-steam').click();
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await expect.poll(sent).toBe(2);
  await page.clock.runFor(30_000);
  await touch(page, 'screen-steam');
  await expect.poll(sent).toBe(3);
  expect(errors).toEqual([]);
});

test('no heartbeat while the machine sleeps; the first touch after the wake sends one', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  const sent = heartbeats(gateway);
  // 'Machine sleep' leaves the skin on screen while the machine sleeps.
  await page.getByTestId('menu').click();
  await page.getByTestId('machine-sleep').click();
  await expect(page.getByTestId('status-title')).toHaveText('Asleep');
  const before = sent();
  for (let i = 0; i < 2; i++) {
    await page.clock.runFor(31_000);
    // The frames come in again after the clock's jump, still sleeping.
    await expect(page.getByTestId('status-title')).toHaveText('Asleep');
    await touch(page);
  }
  await page.waitForTimeout(300);
  expect(sent()).toBe(before);

  await page.getByTestId('menu').click();
  await page.getByTestId('wake-machine').click();
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await touch(page);
  await expect.poll(sent).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('a failed heartbeat is ignored, with no notice', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.heartbeatFails = true;
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await touch(page);
  await expect.poll(heartbeats(gateway)).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  // The browser itself logs the 500; the skin adds nothing.
  expect(errors.filter((error) => !/status of 500/.test(error))).toEqual([]);
});
