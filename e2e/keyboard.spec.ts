import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';

// The keyboard lies over the app (spec 3.9 item 10, acceptance 41), against a mocked gateway.
// Decaid's Android WebView is shrunk to the space above the keyboard (`adjustResize`); here the
// page's height is shrunk the same way, from 1280 x 800 to 1280 x 450, with a text field
// focused. The root font size and the app's height stay; the field's dialog or label lies above
// the new height; with the focus gone and the height back, everything is where it was. The
// real keyboard on the tablet is the founder's check (acceptance 42).

const errors: string[] = [];
const FULL = { width: 1280, height: 800 };
const KEYBOARD = { width: 1280, height: 450 };

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
});

const sizes = (page: Page) =>
  page.evaluate(() => ({
    font: getComputedStyle(document.documentElement).fontSize,
    app: document.getElementById('app')!.getBoundingClientRect().height,
  }));

const box = async (locator: Locator) => (await locator.boundingBox())!;

/** Focuses the field, opens the 'keyboard', checks what stays, closes it again. */
async function withKeyboard(page: Page, field: Locator, keep: Locator, shot: string) {
  const before = await sizes(page);
  expect(before.font).toBe('16px');
  const place = await box(keep);
  await field.focus();
  await page.setViewportSize(KEYBOARD);
  await expect.poll(() => sizes(page)).toEqual(before);
  await expect.poll(async () => (await box(keep)).y + (await box(keep)).height).toBeLessThanOrEqual(KEYBOARD.height);
  expect((await box(keep)).y).toBeGreaterThanOrEqual(0);
  await expect(field).toBeFocused();
  await page.screenshot({ path: `e2e/.results/${shot}` });

  await field.blur();
  await page.setViewportSize(FULL);
  await expect.poll(() => sizes(page)).toEqual(before);
  await expect.poll(async () => (await box(keep)).y).toBeCloseTo(place.y, 0);
  await expect(page.locator('[data-lifted]')).toHaveCount(0);
}

test('the save as dialog keeps its size and stays above the keyboard; the viewport meta resizes only the visual viewport', async ({
  page,
}) => {
  await (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('interactive-widget=resizes-visual');
  await page.getByTestId('save-as').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await withKeyboard(page, page.getByTestId('save-name'), page.getByTestId('save-dialog'), 'keyboard-save-as.png');
  expect(errors).toEqual([]);
});

test("the profile's notes are lifted above the keyboard with their label, and come back", async ({ page }) => {
  const gateway = await mockGateway(page);
  const mine = { ...structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile), title: 'Mine' };
  gateway.workflow.profile = mine;
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await page.getByTestId('tab-settings').click();
  const notes = page.getByTestId('setting-notes');
  await expect(notes).toBeVisible();
  const label = page.locator('label.notes');
  await withKeyboard(page, notes, label, 'keyboard-notes.png');
  // The field in the page was lifted: it lay under the keyboard's top before.
  expect((await box(label)).y + (await box(label)).height).toBeGreaterThan(KEYBOARD.height);
  expect(errors).toEqual([]);
});

test('a height that shrinks without a focused field is taken: the app follows a smaller window', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect.poll(() => sizes(page)).toEqual({ font: '12px', app: 600 });
  await page.setViewportSize(FULL);
  await expect.poll(() => sizes(page)).toEqual({ font: '16px', app: 800 });
  expect(errors).toEqual([]);
});
