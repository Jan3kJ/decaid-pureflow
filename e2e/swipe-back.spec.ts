import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { back, swipe, toPage } from './touch';

// The way back (spec 3.14, Z3; acceptance 93): no screen has a left column or a back arrow; a
// swipe from left to right leaves the editors, the settings, the beans screen and the picker for
// where they were opened from, and on the hot water page a swipe from right to left goes home; a
// swipe that starts on a slider or a row's swipe does not leave; the open history closes by a
// swipe to the left.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The shown screen: the one that is not the neighbour coming in. */
const shown = (page: Page, screen: string) => page.locator(`.page:not([inert]) [data-testid="screen-${screen}"]`);

/** No back arrow, and the screen uses the whole width from the left edge. */
async function noColumn(page: Page, screen: string) {
  await expect(shown(page, screen)).toBeVisible();
  await expect(page.getByTestId('nav-home')).toHaveCount(0);
  await expect(page.locator('.page > nav')).toHaveCount(0);
  const box = (await shown(page, screen).boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(1280);
}

async function fromMenu(page: Page, entry: string) {
  await page.getByTestId('menu').click();
  await page.getByTestId(entry).click();
}

test('a swipe to the right leaves the settings, the beans, the picker and the editor for where they were opened from', async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await noColumn(page, 'home');

  await fromMenu(page, 'open-settings');
  await noColumn(page, 'settings');
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();

  await fromMenu(page, 'open-beans');
  await noColumn(page, 'beans');
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();

  await page.getByTestId('open-profiles').click();
  await noColumn(page, 'profiles');
  // A drag to the right on a row is the row's: the picker stays.
  const row = (await page.getByTestId('profile-item').first().boundingBox())!;
  await swipe(page, { x: row.x + 40, y: row.y + row.height / 2 }, { x: row.x + 600, y: row.y + row.height / 2 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'profiles')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();

  // The editor's picker goes back to the editor, and the editor home.
  await page.getByTestId('open-editor').click();
  await noColumn(page, 'editor');
  await page.getByTestId('editor-profile').click();
  await expect(shown(page, 'profiles')).toBeVisible();
  await back(page);
  await expect(shown(page, 'editor')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('hot water, the leftmost page, goes home by a swipe to the left; a swipe on a slider does not leave', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'hot-water');
  await noColumn(page, 'hot-water');
  // To the right: nothing lies left of hot water.
  await swipe(page, { x: 400, y: 48 }, { x: 1000, y: 48 });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  // On a slider: the slider's drag.
  const slider = (await page.locator('[data-testid^="hot-water-slider-"]').last().boundingBox())!;
  const y = slider.y + slider.height / 2;
  await swipe(page, { x: slider.x + slider.width * 0.8, y }, { x: slider.x + slider.width * 0.1, y });
  await page.waitForTimeout(400);
  await expect(shown(page, 'hot-water')).toBeVisible();
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();
  // Steam goes home to the right.
  await toPage(page, 'steam');
  await noColumn(page, 'steam');
  await back(page);
  await expect(shown(page, 'home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the history opens by the edge swipe to the right and closes by a swipe to the left', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await swipe(page, { x: 30, y: 400 }, { x: 300, y: 400 });
  await expect(page.getByTestId('history')).toBeVisible();
  await swipe(page, { x: 1000, y: 400 }, { x: 500, y: 400 });
  await expect(page.getByTestId('history')).toHaveCount(0);
  await expect(shown(page, 'home')).toBeVisible();
  // Over the list too.
  await swipe(page, { x: 30, y: 400 }, { x: 300, y: 400 });
  const list = (await page.getByTestId('history').boundingBox())!;
  await swipe(page, { x: list.x + list.width - 40, y: 400 }, { x: list.x + 40, y: 400 });
  await expect(page.getByTestId('history')).toHaveCount(0);
  expect(errors).toEqual([]);
});
