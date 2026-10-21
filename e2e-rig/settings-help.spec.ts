import { expect, test, type Page } from '@playwright/test';
import type { MachineInfo, MachineSnapshot } from '../src/api';
import { IDLE } from './idle';

// The rest of Streamline's settings against the rig (spec 3.9 item 15, U12), read only: the rig
// simulates a DE1, not a Bengle, so the Bengle pages are absent from the page and the gateway
// answers 404 for what they would read; the manual's links; the feedback form is filled but never
// sent (Decent's service) and no firmware file is chosen. The writes are in the mocked
// e2e/settings-help.spec.ts.

const GATEWAY = 'http://localhost:8080';

async function status(path: string): Promise<number> {
  return (await fetch(GATEWAY + path, { signal: AbortSignal.timeout(15_000) })).status;
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp =
      ((await (await fetch(`${GATEWAY}/api/v1/machine/state`, { signal: AbortSignal.timeout(15_000) })).json()) as MachineSnapshot)
        .state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

async function openCategory(page: Page, id: string) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId(`settings-category-${id}`).click();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', id);
}

test('the rig is no Bengle: its pages are absent and the gateway answers 404 for them', async ({ page }) => {
  test.skip(!gatewayUp, 'no gateway on port 8080');
  const info = (await (await fetch(`${GATEWAY}/api/v1/machine/info`)).json()) as MachineInfo;
  expect(String(info.model).toLowerCase()).not.toContain('bengle');
  for (const path of ['cupWarmer', 'cupWarmer/preheat', 'ledStrip', 'scaleCalibration']) {
    expect(await status(`/api/v1/machine/${path}`), path).toBe(404);
  }
  await openCategory(page, 'machine');
  await expect(page.getByTestId('settings-section-machineinfo')).toBeVisible();
  await expect(page.getByTestId('settings-section-cupwarmer')).toHaveCount(0);
  await expect(page.getByTestId('settings-section-ledstrip')).toHaveCount(0);
  await page.getByTestId('settings-category-calibration').click();
  await expect(page.getByTestId('settings-section-sensors')).toBeVisible();
  await expect(page.getByTestId('settings-section-loadcell')).toHaveCount(0);
});

test('the manual and the feedback form show; nothing is sent and no firmware file is chosen', async ({ page }) => {
  test.skip(!gatewayUp, 'no gateway on port 8080');
  await openCategory(page, 'usermanual');
  await expect(page.getByTestId('manual-quickstart')).toHaveAttribute('href', 'https://decentespresso.com/doc/quickstart/');
  await page.getByTestId('settings-sub-feedback').click();
  await expect(page.getByTestId('feedback-send')).toBeDisabled();
  await page.getByTestId('feedback-title').fill('Rig check, not sent');
  await expect(page.getByTestId('feedback-send')).toBeEnabled();
  await page.getByTestId('feedback-send').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('public GitHub issue');
  await page.getByTestId('settings-confirm-cancel').click();

  await page.getByTestId('settings-category-updates').click();
  await expect(page.getByTestId('firmware-file')).toBeVisible();
  expect(await status('/api/v1/machine/firmware')).toBe(200);
});
