import { readFileSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';
import { GATEWAY, mockGateway } from './mock-gateway';

// The bag's reading in the ocr build, in Chromium: a photo of a printed bag is read on the page
// with the models from the skin's own ocr/ folder, and its lines are chips under the photo. A tap
// on a chip fills the chosen field; nothing is filled in by itself. Any request to a host other
// than the skin's and Decaid's fails the test.

const BAG = readFileSync(new URL('./fixtures/bag.png', import.meta.url));
const BAG_URL = `data:image/png;base64,${BAG.toString('base64')}`;
// A bag photographed as the skin stores a photo, its name printed bottom to top.
const CANDYMAN = readFileSync(new URL('./fixtures/candyman.jpg', import.meta.url));
const CANDYMAN_URL = `data:image/jpeg;base64,${CANDYMAN.toString('base64')}`;

/** The picture the fake camera shows. */
const test = base.extend<{ cameraPhoto: string }>({ cameraPhoto: [BAG_URL, { option: true }] });

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

let foreign: string[];

test.beforeEach(async ({ page, baseURL, cameraPhoto }) => {
  foreign = [];
  const allowed = [new URL(baseURL!).host, new URL(GATEWAY).host];
  const check = (url: string) => {
    const { protocol, host } = new URL(url);
    if (!['data:', 'blob:'].includes(protocol) && !allowed.includes(host)) foreign.push(url);
  };
  page.on('request', (request) => check(request.url()));
  page.on('websocket', (socket) => check(socket.url()));
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
  }, cameraPhoto);
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
});

test.afterEach(() => {
  expect(foreign).toEqual([]);
});

async function takePhoto(page: Page) {
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-capture')).toBeEnabled();
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('bean-photo')).toBeVisible();
}

test('a photo is read into chips; a tap puts a chip in the chosen field', async ({ page }) => {
  // No reading without a photo.
  await expect(page.getByTestId('bean-reading')).toHaveCount(0);
  await takePhoto(page);
  await expect(page.getByTestId('bean-reading-status')).toHaveText('Reading the bag');
  await expect(page.getByTestId('bean-reading-cancel')).toHaveText('cancel');
  const chips = page.getByTestId('bean-chip');
  await expect(chips.first()).toBeVisible();
  await expect(page.getByTestId('bean-reading-status')).toHaveCount(0);
  // The guessed name first, the guessed roaster second; the fields stay empty until a tap.
  await expect(chips.nth(0)).toHaveText('Red Brick');
  await expect(chips.nth(1)).toHaveText(/^Square Mile Coffee Roasters$/i);
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(2)).toHaveText('Espresso blend ·350g');
  await expect(page.getByTestId('bean-name')).toHaveValue('');
  await expect(page.getByTestId('bean-roaster')).toHaveValue('');

  await expect(page.getByTestId('bean-chip-to-name')).toHaveAttribute('aria-pressed', 'true');
  await chips.nth(0).click();
  await expect(page.getByTestId('bean-name')).toHaveValue('Red Brick');
  await expect(page.getByTestId('bean-chip-to-roaster')).toHaveAttribute('aria-pressed', 'true');
  await chips.nth(1).click();
  await expect(page.getByTestId('bean-roaster')).toHaveValue(/^Square Mile Coffee Roasters$/i);
  // The choice can be turned by hand: the roaster's chip into the name.
  await page.getByTestId('bean-chip-to-name').click();
  await chips.nth(1).click();
  await expect(page.getByTestId('bean-name')).toHaveValue(/^Square Mile Coffee Roasters$/i);

  // The chips are the form's other buttons' size: a touch target as tall as 'new photo'.
  const photoButton = await page.getByTestId('bean-photo-take').boundingBox();
  for (const button of [chips.nth(0), page.getByTestId('bean-chip-to-name')]) {
    expect((await button.boundingBox())!.height).toBeCloseTo(photoButton!.height, 0);
  }

  // A second photo is read with the reader already made; the time is logged for the record.
  const started = Date.now();
  await takePhoto(page);
  await expect(chips.first()).toHaveText('Red Brick');
  console.log(`a second reading, photo taken to chips: ${Date.now() - started} ms`);

  // Remove photo takes the chips away.
  await page.getByTestId('bean-photo-remove').click();
  await expect(page.getByTestId('bean-reading')).toHaveCount(0);
});

test('cancel ends the reading: no chips come, the photo stays', async ({ page }) => {
  await takePhoto(page);
  await expect(page.getByTestId('bean-reading-status')).toHaveText('Reading the bag');
  await page.getByTestId('bean-reading-cancel').click();
  await expect(page.getByTestId('bean-reading')).toHaveCount(0);
  await expect(page.getByTestId('bean-photo')).toBeVisible();
  // The reading that was under way ends without showing its lines.
  await page.waitForTimeout(5_000);
  await expect(page.getByTestId('bean-reading')).toHaveCount(0);
  await expect(page.getByTestId('bean-name')).toHaveValue('');
});

test.describe('a bag with a turned name', () => {
  test.use({ cameraPhoto: CANDYMAN_URL });

  test('the name printed bottom to top is read and guessed, the upright roaster beside it', async ({ page }) => {
    await takePhoto(page);
    const chips = page.getByTestId('bean-chip');
    await expect(chips.first()).toBeVisible();
    // The reading's exact text: 'CANDYMAN' and 'ETHIOPIEN - NATURAL' on the bag; 'Mal' is a jar behind it.
    await expect(chips).toHaveText(['Cdyman', 'Backyard Coffee', 'Mal', 'Giopien-Natural']);
    await expect(page.getByTestId('bean-name')).toHaveValue('');
    await chips.nth(0).click();
    await expect(page.getByTestId('bean-name')).toHaveValue('Cdyman');
    await chips.nth(1).click();
    await expect(page.getByTestId('bean-roaster')).toHaveValue('Backyard Coffee');

    // With the reader made, a reading is the three passes alone; the time is logged for the record.
    await page.getByTestId('bean-photo-remove').click();
    const started = Date.now();
    await takePhoto(page);
    await expect(chips).toHaveText(['Cdyman', 'Backyard Coffee', 'Mal', 'Giopien-Natural']);
    console.log(`a second reading of the turned bag, photo taken to chips: ${Date.now() - started} ms`);
  });
});
