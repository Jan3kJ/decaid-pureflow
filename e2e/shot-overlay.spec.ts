import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// The shot as an overlay over home's graph area (spec 3.8, T2; acceptance 28 and 51): it opens
// when a shot starts, home's state line stays visible above it, it stays after the shot with
// Streamline's per-phase table until a tap anywhere, and the next shot replaces it.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

const cells = async (page: Page, phase: string) =>
  Object.fromEntries(
    await Promise.all(
      ['seconds', 'weight', 'volume', 'temperature', 'flow', 'pressure'].map(async (key): Promise<[string, string]> => [
        key,
        (await page.getByTestId(`phase-${phase}-${key}`).textContent())!.trim(),
      ]),
    ),
  );

test('a shot opens the overlay on home, which stays after it with the per-phase table until a tap', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await expect(page.getByTestId('shot-overlay')).toHaveCount(0);

  // The shot runs: the overlay with the stop button lies on home, under its state line.
  await gateway.replay(page, 0, 0.6);
  const overlay = page.getByTestId('shot-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('status')).toBeVisible();
  await expect(page.getByTestId('stop')).toBeEnabled();
  await expect(page.getByTestId('shot-phases')).toHaveCount(0);
  await expect(page.getByTestId('shot-close')).toHaveCount(0);
  const line = (await page.getByTestId('status').boundingBox())!;
  const shown = (await overlay.boundingBox())!;
  expect(shown.y).toBeGreaterThanOrEqual(line.y + line.height - 1);
  await page.screenshot({ path: 'docs/product/shot-overlay-during.png' });

  // The machine stops and goes idle: the overlay stays, the stop button gives way to the table.
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.waitForTimeout(500);
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId('stop')).toHaveCount(0);
  await expect(page.getByTestId('shot-close-hint')).toBeVisible();
  await expect(page.getByTestId('last-shot')).toHaveCount(0);
  const rows = page.getByTestId('shot-phases').locator('tbody th');
  await expect(rows).toHaveText(['Preinfusion', 'Extraction', 'Total']);
  // Streamline 0.2.14's own table of the same frames (src/shell/phases.test.ts, research.md 24).
  expect(await cells(page, 'preinfusion')).toEqual({
    seconds: '4',
    weight: '0.0g',
    volume: '34',
    temperature: '78→89',
    flow: '7.4→8.0',
    pressure: '0.7→3.1',
  });
  expect(await cells(page, 'extraction')).toEqual({
    seconds: '23',
    weight: '34.0g',
    volume: '40',
    temperature: '89→93',
    flow: '8.0→2.3',
    pressure: '3.3→10.0→6.6',
  });
  expect(await cells(page, 'total')).toEqual({
    seconds: '27',
    weight: '34.0g',
    volume: '74',
    temperature: '',
    flow: '',
    pressure: '',
  });
  const viewport = page.viewportSize()!;
  const table = (await page.getByTestId('shot-phases').boundingBox())!;
  expect(table.y + table.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: 'docs/product/shot-overlay-after.png' });

  // A tap anywhere, here on the menu's place, closes it and does nothing else: home shows the shot.
  const menu = (await page.getByTestId('menu').boundingBox())!;
  await page.mouse.click(menu.x + menu.width / 2, menu.y + menu.height / 2);
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId('menu-list')).toHaveCount(0);
  await expect(page.getByTestId('last-shot')).toBeVisible();
  expect(parseFloat((await page.getByTestId('last-shot-time').textContent())!)).toBeGreaterThan(25);
  expect(errors).toEqual([]);
});

test('the next shot replaces the overlay, open or closed', async ({ page }) => {
  const gateway = await mockGateway(page);
  await home(page);
  await gateway.replay(page, 0, 1);
  await expect(page.getByTestId('shot-phases')).toBeVisible();

  // A second shot while the first one's summary is open: the overlay runs the new one.
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('shot-phases')).toHaveCount(0);
  await expect(page.getByTestId('stop')).toBeEnabled();
  expect(parseFloat((await page.getByTestId('shot-timer').textContent())!)).toBeLessThan(10);
  await gateway.replay(page, 0.3, 1);
  await expect(page.getByTestId('shot-phases')).toBeVisible();

  // Closed, and then a third shot: the overlay opens again, from another screen too.
  await page.getByTestId('shot-close').click();
  await expect(page.getByTestId('last-shot')).toBeVisible();
  await page.getByTestId('open-steam').click();
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await gateway.replay(page, 0, 0.3);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('shot-overlay')).toBeVisible();
  await expect(page.getByTestId('last-shot')).toHaveCount(0);
  expect(errors).toEqual([]);
});
