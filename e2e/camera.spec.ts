import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The camera test page of the hand-over (spec 3.9 item 20, acceptance 54): reached from Skin >
// Backup and version, it asks for a picture through a file input with `capture` and for the live
// camera through `getUserMedia`, and says what each did. Chromium's fake camera stands in for the
// tablet's; what Decaid's WebView does is for the founder to see (docs/install.md).

const PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII=',
  'base64',
);

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test('the page is reached from the settings and both ways of using the camera work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await page.getByTestId('settings-sub-skin-backup').click();
  await page.getByTestId('camera-test-link').click();
  await expect(page).toHaveURL(/\/camera\.html$/);

  // 1. a picture, through the file input with capture
  await expect(page.getByTestId('shot-input')).toHaveAttribute('capture', 'environment');
  await page.getByTestId('shot-input').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: PICTURE });
  await expect(page.getByTestId('shot-result')).toContainText('Works: 2 x 2 px');
  await expect(page.getByTestId('shot-result')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('shot-image')).toBeVisible();

  // 2. the live camera
  await page.getByTestId('live-button').click();
  await expect(page.getByTestId('live-result')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('live-result')).toContainText(/Works: \d+ x \d+ px/);
  await expect(page.getByTestId('live-video')).toBeVisible();
  await page.screenshot({ path: 'docs/product/camera-test.png' });
  await page.getByTestId('live-button').click();
  await expect(page.getByTestId('live-video')).toBeHidden();

  await page.getByTestId('back').click();
  // the skin opens on the screen it was left on: the settings
  await expect(page.getByTestId('settings-content')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a file that is no picture is said to be none', async ({ page }) => {
  await page.goto('/camera.html');
  await page.getByTestId('shot-input').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
  await expect(page.getByTestId('shot-result')).toContainText('not a picture');
  await expect(page.getByTestId('shot-result')).toHaveAttribute('data-state', 'error');
});

test('the refusal is shown with its reason, the page does not fail', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) },
      configurable: true,
    });
  });
  await page.goto('/camera.html');
  await page.getByTestId('live-button').click();
  await expect(page.getByTestId('live-result')).toHaveAttribute('data-state', 'error');
  await expect(page.getByTestId('live-result')).toContainText('NotAllowedError');
  await expect(page.getByTestId('live-video')).toBeHidden();
});

test('a window without getUserMedia says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await page.goto('/camera.html');
  await page.getByTestId('live-button').click();
  await expect(page.getByTestId('live-result')).toContainText('no getUserMedia');
});
