import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The ring's frame covers what lies under it: its base is opaque, the finished shot's graph is not
// visible through it, and neither the ring nor its parts glow.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

/** The colour of the screenshot's pixel at a CSS point, decoded in the page. */
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ data, x, y }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return [...context.getImageData(Math.round(x * 2), Math.round(y * 2), 1, 1).data];
    },
    { data: png, x, y },
  );
}

async function expectOpaqueAndFlat(page: Page, shot: string) {
  const ring = page.getByTestId('water-ring');
  await expect(ring).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator('.glow-arc')).toHaveCount(0);

  const frame = await page.getByTestId('water-view').evaluate((node) => {
    const style = getComputedStyle(node);
    const colour = style.backgroundColor;
    const alpha = colour.startsWith('rgba') ? Number(colour.replace(/.*,\s*/, '').replace(')', '')) : 1;
    const rect = node.getBoundingClientRect();
    const base = getComputedStyle(document.documentElement).getPropertyValue('--bg-rgb').trim().split(/\s+/).map(Number);
    return { alpha, base, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  expect(frame.alpha).toBe(1);

  // A point in the frame's corner, away from the ring: the base under the glass (at most 6 % white), no line of a graph.
  const pixel = await pixelAt(page, frame.left + 12, frame.top + 12);
  frame.base.forEach((channel, index) => {
    expect(pixel[index]).toBeGreaterThanOrEqual(channel);
    expect(pixel[index] - channel).toBeLessThanOrEqual(15);
  });
  expect(pixel[3]).toBe(255);

  const shadows = await page.getByTestId('water-view').evaluate((node) =>
    [node, ...node.querySelectorAll('*')].flatMap((element) => {
      const style = getComputedStyle(element);
      return [style.boxShadow, style.textShadow, style.filter].filter((value) => value !== 'none');
    }),
  );
  expect(shadows, shot).toEqual([]);
  await page.screenshot({ path: `test-results/water-ring-opaque-${shot}.png` });
}

test('flush over a finished shot: the frame is opaque and nothing glows', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('shot-line-pressure')).toBeVisible();
  gateway.waterFor('flush', 6, 6, 90);
  await expectOpaqueAndFlat(page, 'home');
});

test('flush over steam: the frame is opaque and nothing glows', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  gateway.waterFor('flush', 6, 6, 90);
  await toPage(page, 'steam');
  await expectOpaqueAndFlat(page, 'steam');
});
