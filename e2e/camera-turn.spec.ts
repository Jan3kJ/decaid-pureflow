import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The camera overlay turned a quarter fills the screen in the turned format: the pad's turned box
// is the viewport, every button is whole inside it and the video takes the room that is left.
// Turned back to 0 or 180 it is the centred dialog.

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

const VIEWPORT = { width: 1280, height: 800 };

async function openCamera(page: Page) {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
  await page.getByTestId('bean-photo-take').click();
  await expect(page.getByTestId('camera-capture')).toBeEnabled();
}

const box = async (page: Page, id: string) => {
  const found = await page.getByTestId(id).boundingBox();
  if (!found) throw new Error(`${id} has no box`);
  return found;
};

async function expectButtonsInside(page: Page) {
  for (const id of ['camera-capture', 'camera-turn-left', 'camera-turn-right', 'camera-cancel', 'camera-close']) {
    const b = await box(page, id);
    expect(b.x, id).toBeGreaterThanOrEqual(0);
    expect(b.y, id).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, id).toBeLessThanOrEqual(VIEWPORT.width);
    expect(b.y + b.height, id).toBeLessThanOrEqual(VIEWPORT.height);
  }
}

test('turned a quarter the camera overlay fills the screen, at 90 and at 270, and is as before at 0 and 180', async ({ page }) => {
  await openCamera(page);
  await expect(page.getByTestId('camera-pad')).toHaveAttribute('data-angle', '0');
  const dialog = await box(page, 'camera');
  expect(dialog.width).toBeLessThan(VIEWPORT.width * 0.95);
  const unturned = await box(page, 'camera-video');
  await expectButtonsInside(page);
  await page.screenshot({ path: 'docs/product/camera-unturned.png' });

  for (const angle of ['90', '180', '270']) {
    await page.getByTestId('camera-turn-right').click();
    await expect(page.getByTestId('camera-pad')).toHaveAttribute('data-angle', angle);
    // the rotation is applied at once; read the boxes after the layout settles
    await expect.poll(async () => (await box(page, 'camera-pad')).width).toBeGreaterThan(angle === '180' ? 0 : VIEWPORT.width * 0.95);
    const pad = await box(page, 'camera-pad');
    const video = await box(page, 'camera-video');
    if (angle === '180') {
      expect(pad.width).toBeLessThan(VIEWPORT.width * 0.95);
      expect((await box(page, 'camera')).width).toBeCloseTo(dialog.width, 0);
      expect(video.width * video.height).toBeCloseTo(unturned.width * unturned.height, -2);
    } else {
      expect(pad.width).toBeGreaterThanOrEqual(VIEWPORT.width * 0.95);
      expect(pad.height).toBeGreaterThanOrEqual(VIEWPORT.height * 0.95);
      // the viewfinder is the portrait frame, so it is tall but narrower than the landscape box
      expect(video.width * video.height).toBeGreaterThanOrEqual(1.5 * unturned.width * unturned.height);
      await page.screenshot({ path: `docs/product/camera-turned-${angle}.png` });
    }
    await expectButtonsInside(page);
    for (const id of ['camera-capture', 'camera-turn-left', 'camera-turn-right', 'camera-cancel']) {
      const b = await box(page, id);
      expect(Math.min(b.width, b.height), id).toBeGreaterThanOrEqual(44);
    }
  }

  await page.getByTestId('camera-turn-right').click();
  await expect(page.getByTestId('camera-pad')).toHaveAttribute('data-angle', '0');
  expect((await box(page, 'camera')).width).toBeCloseTo(dialog.width, 0);
});

// The camera's frame is marked: a red square in its upper left, a green one in its upper right. The
// tablet is turned the other way from the overlay, so the viewfinder and the stored photo show the
// frame turned back by the overlay's angle: the red mark lands in the corner given below.
const RED_AT: Record<string, 'tl' | 'tr' | 'bl' | 'br'> = { '0': 'tl', '90': 'bl', '180': 'br', '270': 'tr' };

async function markedStream(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext('2d')!;
      const draw = () => {
        context.fillStyle = '#808080';
        context.fillRect(0, 0, 1920, 1080);
        context.fillStyle = '#ff0000';
        context.fillRect(0, 0, 300, 300);
        context.fillStyle = '#00ff00';
        context.fillRect(1620, 0, 300, 300);
      };
      draw();
      setInterval(draw, 100);
      return Promise.resolve(canvas.captureStream(10));
    };
  });
}

/**
 * Where the red and the green mark are in a picture turned counter-clockwise by `back` degrees (a
 * screenshot of the turned pad is turned back to the pad's own frame): the corner of its box each is
 * nearest to, or null.
 */
const marks = (page: Page, url: string, back = 0) =>
  page.evaluate(
    async ([src, degrees]) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const sideways = degrees === 90 || degrees === 270;
      const canvas = document.createElement('canvas');
      canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
      canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((-degrees * Math.PI) / 180);
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      context.setTransform(1, 0, 0, 1, 0, 0);
      const corner = (isMark: (r: number, g: number, b: number) => boolean) => {
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let x = 0;
        let y = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (!isMark(data[i], data[i + 1], data[i + 2])) continue;
          x += (i / 4) % canvas.width;
          y += Math.floor(i / 4 / canvas.width);
          n++;
        }
        if (!n) return null;
        return `${y / n < canvas.height / 2 ? 't' : 'b'}${x / n < canvas.width / 2 ? 'l' : 'r'}`;
      };
      return {
        width: canvas.width,
        height: canvas.height,
        red: corner((r, g, b) => r > 200 && g < 60 && b < 60),
        green: corner((r, g, b) => g > 200 && r < 60 && b < 60),
      };
    },
    [url, back] as const,
  );

test('the viewfinder and the stored photo are upright in the frame turned shape: portrait at 90 and 270, landscape at 0 and 180', async ({
  page,
}) => {
  await markedStream(page);
  await openCamera(page);
  const pad = page.getByTestId('camera-pad');
  const greenAt: Record<string, string> = { '0': 'tr', '90': 'tl', '180': 'bl', '270': 'br' };

  for (const angle of ['0', '90', '180', '270']) {
    for (let i = 0; i < Number(angle) / 90; i++) await page.getByTestId('camera-turn-right').click();
    await expect(pad).toHaveAttribute('data-angle', angle);
    const portrait = angle === '90' || angle === '270';
    if (portrait) await expect.poll(async () => (await box(page, 'camera-pad')).width).toBeGreaterThan(VIEWPORT.width * 0.95);
    await page.waitForTimeout(300);

    // the frame's layout box is in the pad's own frame, the one the pad's turn makes upright
    const frame = await page
      .getByTestId('camera-frame')
      .evaluate((el: HTMLElement) => ({ width: el.offsetWidth, height: el.offsetHeight }));
    if (portrait) {
      expect(frame.height).toBeGreaterThan(frame.width);
      expect(frame.height / frame.width).toBeCloseTo(16 / 9, 1);
      const padBox = await box(page, 'camera-pad');
      expect(padBox.width).toBeGreaterThanOrEqual(VIEWPORT.width * 0.95);
      // how far down the pad's own frame (0 top, 1 bottom) a button's centre lies
      const down = async (id: string) => {
        const b = await box(page, id);
        const radians = (Number(angle) * Math.PI) / 180;
        const dx = b.x + b.width / 2 - (padBox.x + padBox.width / 2);
        const dy = b.y + b.height / 2 - (padBox.y + padBox.height / 2);
        return (-dx * Math.sin(radians) + dy * Math.cos(radians)) / padBox.width + 0.5;
      };
      expect(await down('camera-capture')).toBeGreaterThan(2 / 3);
      expect(await down('camera-close')).toBeLessThan(1 / 3);
    } else {
      expect(frame.width).toBeGreaterThan(frame.height);
      expect(frame.width / frame.height).toBeCloseTo(16 / 9, 1);
    }

    // the viewfinder as drawn
    const shot = await page.getByTestId('camera-frame').screenshot({ path: `docs/product/camera-marked-${angle}.png` });
    const seen = await marks(page, `data:image/png;base64,${shot.toString('base64')}`, Number(angle));
    expect(seen.red, `viewfinder red at ${angle}`).toBe(RED_AT[angle]);
    expect(seen.green, `viewfinder green at ${angle}`).toBe(greenAt[angle]);

    // the stored photo has the same shape and the same orientation
    await page.getByTestId('camera-capture').click();
    await expect(page.getByTestId('camera')).toHaveCount(0);
    const src = await page.getByTestId('bean-photo').getAttribute('src');
    const photo = await marks(page, src!);
    expect([photo.width, photo.height], `photo at ${angle}`).toEqual(portrait ? [576, 1024] : [1024, 576]);
    expect(photo.red, `photo red at ${angle}`).toBe(RED_AT[angle]);
    expect(photo.green, `photo green at ${angle}`).toBe(greenAt[angle]);
    if (angle === '90') await page.getByTestId('bean-photo').screenshot({ path: 'docs/product/camera-photo-90.png' });
    if (angle === '270') break;
    await page.getByTestId('bean-photo-take').click();
    await expect(page.getByTestId('camera-capture')).toBeEnabled();
  }
});
