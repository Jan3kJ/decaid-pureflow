import { expect, test, type Locator } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// Z121: an overlay lies over page content, so its surface is dense: the base colour has an alpha
// of at least 0.9 and the text on it a contrast of at least 7:1 (the glass highlight added in the
// worst case), and the scrim behind the menu is darker than before.

type Rgba = [number, number, number, number];

const channels = (colour: string): Rgba => {
  const numbers = colour.match(/[\d.]+/g)!.map(Number);
  return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1];
};

const luminance = ([r, g, b]: number[]) => {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

/** The surface's base colour and its text colour, read from the computed style. */
async function surface(locator: Locator) {
  const { background, color } = await locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  return { base: channels(background), text: channels(color) };
}

async function expectReadable(locator: Locator) {
  const { base, text } = await surface(locator);
  expect(base[3]).toBeGreaterThanOrEqual(0.9);
  // the base over the page's own black, and the glass highlight at its brightest, 5.5 % white
  const over = base.slice(0, 3).map((c) => c * base[3]);
  const lit = over.map((c) => c * (1 - 0.055) + 255 * 0.055);
  const [light, dark] = [luminance(text), luminance(lit)].sort((a, b) => b - a);
  expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(7);
}

test('the menu, the shot history and a dialog have a dense surface and readable text', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.withDefaults('light');
  const at = '2026-10-20T10:00:00.000';
  gateway.grinders = [
    { id: 'g1', model: 'Niche Zero', archived: false, settingType: 'numeric', settingSmallStep: 0.5, createdAt: at, updatedAt: at },
  ];
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');

  await page.getByTestId('menu').click();
  await expectReadable(page.getByTestId('menu-list'));
  const scrim = await page.getByTestId('menu-backdrop').evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(channels(scrim)[3]).toBeGreaterThanOrEqual(0.5);
  await page.getByTestId('menu-backdrop').click({ position: { x: 5, y: 5 } });

  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  await expectReadable(page.getByTestId('history'));
  await page.getByTestId('history-outside').click({ position: { x: 1270, y: 400 } });
  await expect(page.getByTestId('history')).toHaveCount(0);

  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await page.getByTestId('save-as').click();
  await expectReadable(page.getByTestId('save-dialog'));
});
