import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// A shot Decaid stops for want of a scale, against the mocked gateway: with 'scale required' on
// and no scale, the sequencer's abort for 'noScale' on /ws/v1/machine/shotState, or without a
// sequencer an espresso of 0.1 s, opens the popup on every screen, once for one blocked start;
// 'look for the scale' scans, 'close' and Escape close it. With the scale connected, or the
// setting off, a short espresso opens nothing.

const errors: string[] = [];
let gateway: MockGateway;
const SCAN = '/api/v1/devices/scan';
const TEXT =
  "'scale required' is on in Settings > Connections, so the machine stops every shot without a scale. Check that the scale is on and in range, then start again.";

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Home with Decaid's 'scale required' as given and the scale away or there. */
async function open(page: Page, options: { required?: boolean; scale?: boolean } = {}) {
  gateway.decaidSettings.blockOnNoScale = options.required ?? true;
  gateway.connectScale(options.scale ?? false);
  await page.goto('/');
  await expect(page.getByTestId('state-scale')).toHaveText(options.scale ? '0.0 g' : /looking for it|not connected/);
}

const dialog = (page: Page) => page.getByTestId('no-scale-dialog');

test("the sequencer's abort opens the popup: its text, 'look for the scale' scans and closes it", async ({ page }) => {
  await open(page);
  gateway.blockedStart();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute('role', 'alertdialog');
  await expect(dialog(page).getByRole('heading')).toHaveText('The shot was stopped: no scale is connected.');
  await expect(page.getByTestId('no-scale-text')).toHaveText(TEXT);
  await expect(dialog(page).getByRole('button')).toHaveText(['close', 'look for the scale']);

  const scans = gateway.calls('GET', SCAN).length;
  await page.getByTestId('no-scale-find').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => gateway.calls('GET', SCAN).length, { timeout: 2_000 }).toBeGreaterThan(scans);
});

test("'close' and Escape close it; one blocked start is one popup, the next start another, on another screen too", async ({
  page,
}) => {
  await open(page);
  gateway.blockedStart();
  await expect(dialog(page)).toHaveCount(1);
  await page.getByTestId('no-scale-close').click();
  await expect(dialog(page)).toHaveCount(0);
  // The same start said again: the frame repeated.
  gateway.sendShotState({
    event: 'decision',
    shotId: 'repeated',
    decision: { kind: 'abort', reason: 'noScale', details: null, data: null },
  });
  gateway.sendShotState({
    event: 'decision',
    shotId: 'repeated',
    decision: { kind: 'abort', reason: 'noScale', details: null, data: null },
  });
  await expect(dialog(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-content')).toBeVisible();
  // The frame alone: the machine's short espresso would bring home, as every start does.
  gateway.sendShotState({
    event: 'decision',
    shotId: 'next',
    decision: { kind: 'abort', reason: 'noScale', details: 'No scale connected, blocking shot', data: null },
  });
  await expect(dialog(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId('settings-content')).toBeVisible();
});

test("without a sequencer, an espresso of 0.1 s without a scale and with 'scale required' on opens it", async ({ page }) => {
  await open(page);
  gateway.blockedStart(false);
  await expect(dialog(page)).toHaveCount(1);
  await expect(page.getByTestId('no-scale-text')).toHaveText(TEXT);
});

test("a short espresso with the scale connected, or with 'scale required' off, opens nothing; nor do other decisions", async ({
  page,
}) => {
  await open(page, { scale: true });
  gateway.blockedStart(false);
  for (const [kind, reason] of [
    ['abort', 'error'],
    ['stop', 'apiStop'],
    ['terminal', 'disconnected'],
  ]) {
    gateway.sendShotState({ event: 'decision', shotId: kind, decision: { kind, reason, details: null, data: null } });
  }
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);

  await open(page, { required: false });
  const reads = gateway.calls('GET', '/api/v1/settings').length;
  gateway.blockedStart(false);
  // The setting is read when the short espresso ends.
  await expect.poll(() => gateway.calls('GET', '/api/v1/settings').length).toBeGreaterThan(reads);
  await page.waitForTimeout(300);
  await expect(dialog(page)).toHaveCount(0);
});
