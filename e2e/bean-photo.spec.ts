import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// A bean from a photo of its bag (spec 3.9 item 20, acceptance 54) against the mocked gateway:
// the bean form's photo button opens the live camera, a capture is shown in the form and stored
// with the bean as a JPEG in the skin's KV namespace, and is deleted when the bean is gone. The
// photo of a printed bag (`fixtures/bag.png`) pre-fills the empty name and roaster with
// Tesseract.js, whose files come from the skin's own server: every other host is blocked. Where
// `getUserMedia` is missing the file input stands in. The same on the rig: e2e-rig/bean-photo.spec.ts.

const BAG = readFileSync(new URL('./fixtures/bag.png', import.meta.url));
const BAG_URL = `data:image/png;base64,${BAG.toString('base64')}`;
const SKIN = 'http://localhost:24800';
const READING = 60_000;

test.setTimeout(180_000);

const errors: string[] = [];
/** requests to hosts other than the skin's server and the mocked gateway */
const foreign: string[] = [];
let gateway: MockGateway;

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test.beforeEach(async ({ page, context }) => {
  errors.length = 0;
  foreign.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  // The gateway's routes are the page's and come first; everything else not the skin's is blocked.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(SKIN) || url.startsWith('data:') || url.startsWith('blob:')) return route.fallback();
    foreign.push(url);
    return route.abort('blockedbyclient');
  });
  context.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(SKIN) && !url.startsWith('http://localhost:8080') && !/^(data|blob):/.test(url)) foreign.push(url);
  });
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
  expect(foreign).toEqual([]);
});

async function openBeans(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
  await expect(page.getByTestId('screen-beans')).toBeVisible();
}

/** The live camera shows the bag: `getUserMedia` answers a canvas's stream with the picture drawn on it. */
async function cameraShowsBag(page: Page) {
  await page.addInitScript((url) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      const draw = () => context.drawImage(image, 0, 0);
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
  }, BAG_URL);
}

const photoSize = (page: Page) =>
  page.getByTestId('bean-photo').evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, src: image.src.slice(0, 23) };
  });

test('a photo from the live camera is shown in the form, stored with the bean, removed, and deleted with the bean', async ({
  page,
}) => {
  await openBeans(page);
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await expect(page.getByTestId('camera-capture')).toBeEnabled();
  await page.screenshot({ path: 'docs/product/bean-camera.png' });
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('camera')).toHaveCount(0);
  // Chromium's fake camera gives 1920 x 1080: stored at 1024 px on the long side.
  expect(await photoSize(page)).toEqual({ width: 1024, height: 576, src: 'data:image/jpeg;base64,' });

  // The fake camera's picture holds no print: the reading ends with the fields as they were.
  await expect(page.getByTestId('bean-ocr')).toHaveCount(0, { timeout: READING });
  await expect(page.getByTestId('bean-name')).toHaveValue('');
  await expect(page.getByTestId('bean-roaster')).toHaveValue('');

  await page.getByTestId('bean-name').fill('Red Brick');
  await page.getByTestId('bean-roaster').fill('Square Mile');
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-row')).toHaveCount(1);
  const bean = gateway.beans[0];
  const key = `pureflow/bean-photo-${bean.id}`;
  expect(String(gateway.store[key])).toMatch(/^data:image\/jpeg;base64,/);

  // Opened again, the form shows the stored photo.
  await page.getByTestId('beans-add').click();
  await expect(page.getByTestId('bean-photo')).toHaveCount(0);
  await page.getByTestId('bean-row').click();
  await expect(page.getByTestId('bean-photo')).toHaveAttribute('src', String(gateway.store[key]));
  await page.screenshot({ path: 'docs/product/bean-photo.png' });

  // A removed photo is deleted when the bean is saved.
  await page.getByTestId('bean-photo-remove').click();
  await expect(page.getByTestId('bean-photo')).toHaveCount(0);
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-save')).toBeDisabled();
  // disabled while the save runs too: the key goes during it
  await expect.poll(() => key in gateway.store).toBe(false);

  // A photo of a bean deleted in another app is deleted at the next read of the catalogue.
  gateway.store[key] = 'data:image/jpeg;base64,/9j/';
  gateway.store['pureflow/settings-backup'] = { kept: true };
  gateway.beans.length = 0;
  // The skin opens again on the screen it showed.
  await page.reload();
  await expect(page.getByTestId('beans-empty')).toBeVisible();
  await expect.poll(() => key in gateway.store).toBe(false);
  expect(gateway.store['pureflow/settings-backup']).toEqual({ kept: true });
});

test('the photo of a printed bag pre-fills the empty name, leaves the typed roaster, with no request to another host', async ({
  page,
}) => {
  await cameraShowsBag(page);
  await openBeans(page);
  await page.getByTestId('bean-roaster').fill('My roaster');
  await page.getByTestId('bean-photo-take').click();
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('bean-ocr')).toBeVisible();
  await expect(page.getByTestId('bean-ocr-status')).toContainText('%');
  await expect(page.getByTestId('bean-name')).toHaveValue('Red Brick', { timeout: READING });
  await expect(page.getByTestId('bean-roaster')).toHaveValue('My roaster');
  await expect(page.getByTestId('bean-ocr')).toHaveCount(0);

  // Read again into empty fields, both are filled; the user corrects them before saving.
  await page.getByTestId('bean-name').fill('');
  await page.getByTestId('bean-roaster').fill('');
  await page.getByTestId('bean-photo-take').click();
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('bean-roaster')).toHaveValue('Square Mile Coffee Roasters', { timeout: READING });
  await expect(page.getByTestId('bean-name')).toHaveValue('Red Brick');
  await page.getByTestId('bean-roaster').fill('Square Mile');
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-row')).toContainText('Square Mile · Red Brick');
  expect(gateway.calls('POST', '/api/v1/beans').map((call) => call.body)).toEqual([{ name: 'Red Brick', roaster: 'Square Mile' }]);
  expect(String(gateway.store[`pureflow/bean-photo-${gateway.beans[0].id}`])).toMatch(/^data:image\/jpeg;base64,/);
});

test('without getUserMedia the file input stands in; a cancelled or failed reading leaves the fields as they were', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  });
  await openBeans(page);
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-refused')).toContainText('no live camera');
  await page.getByTestId('camera-file').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: BAG });
  await expect(page.getByTestId('camera')).toHaveCount(0);
  expect(await photoSize(page)).toEqual({ width: 640, height: 400, src: 'data:image/jpeg;base64,' });

  // Cancel stops the reading.
  await expect(page.getByTestId('bean-ocr')).toBeVisible();
  await page.getByTestId('bean-ocr-cancel').click();
  await expect(page.getByTestId('bean-ocr')).toHaveCount(0);
  await page.waitForTimeout(3000);
  await expect(page.getByTestId('bean-name')).toHaveValue('');
  await expect(page.getByTestId('bean-roaster')).toHaveValue('');

  // Without the English data the reading fails and says so; the fields stay as they were.
  await page.route('**/ocr/eng.traineddata.gz', (route) => route.fulfill({ status: 404, body: '' }));
  await page.getByTestId('bean-photo-take').click();
  await page.getByTestId('camera-file').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: BAG });
  await expect(page.getByTestId('bean-ocr-note')).toContainText('not read', { timeout: READING });
  await expect(page.getByTestId('bean-name')).toHaveValue('');
  await expect(page.getByTestId('bean-roaster')).toHaveValue('');
  await expect(page.getByTestId('bean-photo')).toBeVisible();
  // the browser's own line for the refused file
  const refused = errors.filter((error) => !/404/.test(error));
  errors.splice(0, errors.length, ...refused);
});
