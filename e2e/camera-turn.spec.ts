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
      expect(video.width * video.height).toBeGreaterThanOrEqual(2.5 * unturned.width * unturned.height);
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
