import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile, record } from './mock-gateway';
import { swipe } from './touch';

// The picker's rename, against a mocked gateway: a move of a
// stored profile's row to the right shows 'rename' at its left end, which opens a dialog on the
// title; Rename sends `PUT /api/v1/profiles/{id}` with the new title and no metadata. An empty
// title, another profile's title and the same title send nothing; the skin's defaults do not
// move to the right; the loaded profile is loaded again under its new name; Decaid's refusal is
// the picker's error line. The swipe from the screen's left edge still goes back over a row.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const item = (page: Page, title: string) => page.getByTestId('profile-item').filter({ hasText: title });
const puts = (gateway: { requests: { method: string; path: string }[] }) =>
  gateway.requests.filter((request) => request.method === 'PUT' && request.path.startsWith('/api/v1/profiles/'));

/** A finger's move along a row, from near its left end (well inside the edge strip) `dx` pixels across. */
async function swipeRow(page: Page, title: string, dx: number) {
  await item(page, title).scrollIntoViewIfNeeded();
  const box = (await item(page, title).boundingBox())!;
  const from = { x: box.x + 60, y: box.y + box.height / 2 };
  await swipe(page, from, { x: from.x + dx, y: from.y + 4 });
}

async function picker(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await expect(item(page, 'D-Flow / default')).toHaveCount(1);
}

/** Opens the rename dialog of a row. */
async function askRename(page: Page, title: string) {
  await swipeRow(page, title, 200);
  await page.getByTestId('profile-rename').click();
  await expect(page.getByTestId('settings-confirm')).toBeVisible();
}

async function typeTitle(page: Page, title: string) {
  await page.getByTestId('settings-confirm-field').fill(title);
  await page.getByTestId('settings-confirm-ok').click();
}

test('a move to the right shows rename at the left end; Rename sends the new title and selects the row', async ({ page }) => {
  const gateway = await mockGateway(page);
  await picker(page);

  await swipeRow(page, 'D-Flow / default', 200);
  const button = page.getByTestId('profile-rename');
  await expect(button).toBeVisible();
  await expect(page.getByTestId('profile-delete')).toHaveCount(0);
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await expect(page.locator('[data-testid="profile-item"][aria-pressed="true"]')).toHaveCount(0);
  // At the row's left end, the row narrowed by it.
  const row = (await item(page, 'D-Flow / default').boundingBox())!;
  const at = (await button.boundingBox())!;
  expect(at.x + at.width).toBeLessThanOrEqual(row.x + 1);
  expect(Math.abs(at.width - 7 * 16 + 0.4 * 16)).toBeLessThan(2);
  await page.screenshot({ path: 'docs/product/picker-rename.png' });

  // A move back closes it.
  await swipeRow(page, 'D-Flow / default', -200);
  await expect(button).toHaveCount(0);
  await expect(page.getByTestId('profile-delete')).toHaveCount(0);

  await askRename(page, 'D-Flow / default');
  const field = page.getByTestId('settings-confirm-field');
  await expect(field).toHaveValue('D-Flow / default');
  await expect(field).toBeFocused();
  await page.getByTestId('settings-confirm-cancel').click();
  await expect(page.getByTestId('settings-confirm')).toHaveCount(0);
  expect(puts(gateway)).toEqual([]);

  await askRename(page, 'D-Flow / default');
  await typeTitle(page, '  Zz morning  ');
  await expect(page.getByTestId('settings-confirm')).toHaveCount(0);
  await expect(item(page, 'Zz morning')).toHaveAttribute('aria-pressed', 'true');
  await expect(item(page, 'D-Flow / default')).toHaveCount(0);
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText('Zz morning');
  const sent = gateway.calls('PUT', '/api/v1/profiles/profile%3Adflow');
  expect(sent).toHaveLength(1);
  expect(sent[0].body.profile.title).toBe('Zz morning');
  expect(sent[0].body.profile.steps).toHaveLength(3);
  expect(sent[0].body).not.toHaveProperty('metadata');
  // The same record, its metadata kept; the list read again and sorted: the new name last.
  expect(gateway.profiles.find((stored) => stored.id === 'profile:dflow')?.metadata).toEqual({ source: 'bundled' });
  await expect(page.getByTestId('profile-item').last()).toHaveText(/Zz morning/);
  expect(errors).toEqual([]);
});

test('an empty title and another profile’s title say why; the same title is a cancel', async ({ page }) => {
  const gateway = await mockGateway(page);
  await picker(page);
  await askRename(page, 'Adaptive v2');
  const why = page.getByTestId('settings-confirm-error');

  await typeTitle(page, '   ');
  await expect(why).toHaveText('A profile needs a name.');
  await typeTitle(page, 'Best practice');
  await expect(why).toHaveText('A profile with that name exists.');
  // One of the skin's defaults.
  await typeTitle(page, 'A-Flow / default-light');
  await expect(why).toHaveText('A profile with that name exists.');
  expect(puts(gateway)).toEqual([]);

  await typeTitle(page, 'Adaptive v2 ');
  await expect(page.getByTestId('settings-confirm')).toHaveCount(0);
  expect(puts(gateway)).toEqual([]);
  await expect(item(page, 'Adaptive v2')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the skin's defaults do not move to the right; a vertical drag still scrolls the list", async ({ page }) => {
  const gateway = await mockGateway(page);
  for (let i = 10; i < 40; i += 1) gateway.profiles.push(record(`profile:extra${i}`, profile(`Extra ${i}`, i), null));
  await picker(page);

  await swipeRow(page, 'A-Flow / default-light', 200);
  await expect(page.getByTestId('profile-rename')).toHaveCount(0);
  await expect(page.getByTestId('screen-profiles')).toBeVisible();

  const list = page.getByTestId('profile-list');
  const box = (await item(page, 'Extra 20').boundingBox())!;
  await swipe(page, { x: box.x + 80, y: 700 }, { x: box.x + 86, y: 300 });
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await expect(page.getByTestId('profile-rename')).toHaveCount(0);

  // One open row at a time: rename on one, delete on another closes the first; a tap elsewhere closes.
  await swipeRow(page, 'Extra 30', 200);
  await expect(page.getByTestId('profile-rename')).toHaveCount(1);
  await page.getByTestId('profile-filter').click();
  await expect(page.getByTestId('profile-rename')).toHaveCount(0);
  await swipeRow(page, 'Extra 30', 200);
  await swipeRow(page, 'Extra 31', -200);
  await expect(page.getByTestId('profile-rename')).toHaveCount(0);
  await expect(page.getByTestId('profile-delete')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the loaded profile renamed is loaded again under its new name', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = gateway.profiles[0].profile;
  await picker(page);
  await expect(item(page, 'Best practice')).toHaveAttribute('data-loaded', 'true');

  await askRename(page, 'Best practice');
  await typeTitle(page, 'My best');
  await expect(item(page, 'My best')).toHaveAttribute('data-loaded', 'true');
  await expect(item(page, 'My best').locator('.tag.loaded')).toHaveText('loaded');
  expect(gateway.calls('PUT', '/api/v1/workflow').at(-1)!.body.profile.title).toBe('My best');
  expect(gateway.workflow.profile.title).toBe('My best');
  expect(errors).toEqual([]);
});

test("Decaid's refusal is the picker's error line and keeps the old name", async ({ page }) => {
  const gateway = await mockGateway(page);
  await picker(page);
  await askRename(page, 'Adaptive v2');
  // Gone from the gateway meanwhile: the mock answers 400 as Decaid does.
  const kept = gateway.profiles;
  gateway.profiles = kept.filter((stored) => stored.id !== 'profile:adaptive');
  await typeTitle(page, 'Adaptive v3');
  await expect(page.getByTestId('profiles-error')).toContainText('The profile could not be renamed');
  gateway.profiles = kept;
  await expect(item(page, 'Adaptive v2')).toHaveCount(1);
  await expect(item(page, 'Adaptive v3')).toHaveCount(0);
});
