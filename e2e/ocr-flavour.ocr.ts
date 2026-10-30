import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The ocr build loads, and a photo taken in the bean form is handed to the bag's reader: its
// chunk is fetched from the skin's own server when the photo is captured. The form shows no line yet.

const BAG = readFileSync(new URL('./fixtures/bag.png', import.meta.url));
const BAG_URL = `data:image/png;base64,${BAG.toString('base64')}`;

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test('the ocr flavour loads and reads a new photo with its reader', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((url) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      return canvas.captureStream(10);
    };
  }, BAG_URL);
  await mockGateway(page);
  const manifest = await page.request.get('/manifest.json');
  expect(((await manifest.json()) as { description: string }).description).toMatch(/ With bag reading\.$/);

  const readers: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/read-[\w-]+\.js$/.test(request.url())) readers.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-capture')).toBeEnabled();
  expect(readers).toEqual([]);
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('bean-photo')).toBeVisible();
  await expect.poll(() => readers.length).toBe(1);
  // The models are served beside the code.
  const model = await page.request.head('/ocr/PP-OCRv6_tiny_det_onnx_infer.tar');
  expect(model.status()).toBe(200);
  await expect(page.getByTestId('bean-name')).toHaveValue('');
  expect(errors).toEqual([]);
});
