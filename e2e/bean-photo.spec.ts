import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// A bean from a photo of its bag against the mocked gateway:
// the bean form's photo button opens the live camera, a capture is shown in the form and stored
// with the bean as a JPEG in the skin's KV namespace, and is deleted when the bean is gone. The
// photo is not read: the photo of a printed bag (`fixtures/bag.png`) leaves the
// fields as they were, and no request goes to another host. Where `getUserMedia` is missing the
// file input stands in. The same on the rig: e2e-rig/bean-photo.spec.ts.

const BAG = readFileSync(new URL('./fixtures/bag.png', import.meta.url));
const BAG_URL = `data:image/png;base64,${BAG.toString('base64')}`;
const SKIN = 'http://localhost:24800';

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
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
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

/**
 * The answer to the photo's write. A new bean's photo is stored after the bean is added and the
 * list read back, so its row shows before the photo is in the store. Start it before the tap.
 */
const photoStored = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname.startsWith('/api/v1/store/pureflow/bean-photo-'),
  );

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
  // taps that leave the form are ignored for a second after the capture
  await page.waitForTimeout(1000);

  await expect(page.getByTestId('bean-name')).toHaveValue('');
  await expect(page.getByTestId('bean-roaster')).toHaveValue('');

  await page.getByTestId('bean-name').fill('Red Brick');
  await page.getByTestId('bean-roaster').fill('Square Mile');
  const stored = photoStored(page);
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-row')).toHaveCount(1);
  await stored;
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

/** The bean form shows no reading of the photo: no progress line, no Cancel, no lines as chips. */
async function noReading(page: Page) {
  const form = page.getByTestId('bean-form');
  await expect(form.getByRole('status')).toHaveCount(0);
  await expect(form.getByTestId('bean-reading')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'cancel' })).toHaveCount(0);
  await expect(form.getByRole('button')).toHaveText(['new photo', 'remove photo', 'no roast date', 'add']);
}

test('the turn buttons turn the camera a quarter left or right per tap, capture stays the lower control, and the photo is turned the same', async ({
  page,
}) => {
  await cameraShowsBag(page);
  await openBeans(page);
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-capture')).toBeEnabled();
  const pad = page.getByTestId('camera-pad');
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  for (const angle of ['0', '90', '180', '270']) {
    await expect(pad).toHaveAttribute('data-angle', angle);
    const capture = await box('camera-capture');
    const video = await box('camera-video');
    // the capture button is at the overlay's lower side, which the turn moves to the left, top or right
    if (angle === '0') expect(capture.y).toBeGreaterThan(video.y + video.height - 1);
    if (angle === '90') expect(capture.x + capture.width).toBeLessThanOrEqual(video.x + 1);
    if (angle === '180') expect(capture.y + capture.height).toBeLessThanOrEqual(video.y + 1);
    if (angle === '270') expect(capture.x).toBeGreaterThanOrEqual(video.x + video.width - 1);
    await page.getByTestId('camera-turn-right').click();
  }
  await expect(pad).toHaveAttribute('data-angle', '0');
  await page.getByTestId('camera-turn-left').click();
  await expect(pad).toHaveAttribute('data-angle', '270');
  await page.getByTestId('camera-turn-left').click();
  await page.getByTestId('camera-turn-left').click();
  await page.getByTestId('camera-turn-left').click();
  await expect(pad).toHaveAttribute('data-angle', '0');
  await page.getByTestId('camera-turn-right').click();
  // at 90 the captured 640 x 400 frame is 400 x 640
  await expect(pad).toHaveAttribute('data-angle', '90');
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('camera')).toHaveCount(0);
  expect(await photoSize(page)).toEqual({ width: 400, height: 640, src: 'data:image/jpeg;base64,' });
  // the angle is not kept: the next camera starts upright
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-pad')).toHaveAttribute('data-angle', '0');
});

test('a tap on a bean right after the capture is ignored, and works a second later; the photo is kept', async ({ page }) => {
  await cameraShowsBag(page);
  await openBeans(page);
  await page.getByTestId('bean-name').fill('First');
  await page.getByTestId('bean-roaster').fill('Roaster');
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-row')).toHaveCount(1);
  await page.getByTestId('beans-add').click();
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-capture')).toBeEnabled();
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('bean-photo')).toBeVisible();
  await page.getByTestId('bean-row').click({ noWaitAfter: true });
  await expect(page.getByTestId('bean-photo')).toBeVisible();
  await expect(page.getByTestId('bean-row')).not.toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(1100);
  await page.getByTestId('bean-row').click();
  await expect(page.getByTestId('bean-row')).toHaveAttribute('aria-current', 'true');
});

test('the photo of a printed bag is kept, not read: the fields stay as they were, with no request to another host', async ({
  page,
}) => {
  await cameraShowsBag(page);
  await openBeans(page);
  await page.getByTestId('bean-roaster').fill('My roaster');
  await page.getByTestId('bean-photo-take').click();
  await page.getByTestId('camera-capture').click();
  await expect(page.getByTestId('camera')).toHaveCount(0);
  expect(await photoSize(page)).toEqual({ width: 640, height: 400, src: 'data:image/jpeg;base64,' });
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('bean-name')).toHaveValue('');
  await expect(page.getByTestId('bean-roaster')).toHaveValue('My roaster');
  await noReading(page);

  await page.getByTestId('bean-name').fill('Red Brick');
  const stored = photoStored(page);
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-row')).toContainText('My roaster · Red Brick');
  await stored;
  expect(gateway.calls('POST', '/api/v1/beans').map((call) => call.body)).toEqual([{ name: 'Red Brick', roaster: 'My roaster' }]);
  expect(String(gateway.store[`pureflow/bean-photo-${gateway.beans[0].id}`])).toMatch(/^data:image\/jpeg;base64,/);
});

test('without getUserMedia the file input stands in, for the first photo and a new one', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  });
  await openBeans(page);
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-refused')).toContainText('no live camera');
  await page.getByTestId('camera-file').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: BAG });
  await expect(page.getByTestId('camera')).toHaveCount(0);
  expect(await photoSize(page)).toEqual({ width: 640, height: 400, src: 'data:image/jpeg;base64,' });
  await expect(page.getByTestId('bean-name')).toHaveValue('');
  await expect(page.getByTestId('bean-roaster')).toHaveValue('');
  await noReading(page);

  // New photo opens the camera dialog again; a file that is not a picture keeps the photo.
  const first = await page.getByTestId('bean-photo').getAttribute('src');
  await page.getByTestId('bean-photo-take').click();
  await page.getByTestId('camera-file').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: Buffer.from('no picture') });
  await expect(page.getByTestId('camera')).toContainText('not a picture');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('camera')).toHaveCount(0);
  await expect(page.getByTestId('bean-photo')).toHaveAttribute('src', first ?? '');
});

/** A picture of the given size, as PNG bytes. */
const picture = async (page: Page, width: number, height: number) =>
  Buffer.from(
    await page.evaluate(
      async ([w, h]) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#c33';
        context.fillRect(0, 0, w, h);
        const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      },
      [width, height],
    ),
  );

test('the thumbnail shows the whole photo in its own shape, a portrait photo upright and a landscape one wide', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  });
  await openBeans(page);
  const thumbnail = page.getByTestId('bean-photo');
  const shape = async () => {
    await expect(thumbnail).toBeVisible();
    await thumbnail.evaluate((image: HTMLImageElement) => image.decode());
    const box = (await thumbnail.boundingBox())!;
    return { box, ratio: box.width / box.height };
  };

  await page.getByTestId('bean-photo-take').click();
  await page
    .getByTestId('camera-file')
    .setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: await picture(page, 600, 800) });
  await expect(page.getByTestId('camera')).toHaveCount(0);
  await expect(thumbnail).toHaveClass(/portrait/);
  let result = await shape();
  expect(result.ratio).toBeCloseTo(0.75, 1);
  expect(result.box.height).toBeGreaterThan(result.box.width);
  const portraitHeight = result.box.height;

  await page.getByTestId('bean-photo-take').click();
  await page.getByTestId('camera-file').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: BAG });
  await expect(page.getByTestId('camera')).toHaveCount(0);
  await expect(thumbnail).not.toHaveClass(/portrait/);
  result = await shape();
  expect(result.ratio).toBeCloseTo(640 / 400, 1);
  expect(result.box.width).toBeGreaterThan(result.box.height);
  expect(result.box.height).toBeLessThan(portraitHeight);
});
